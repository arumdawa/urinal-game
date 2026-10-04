const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT =
    process.env.PORT || 3000;
const TURN_TIME_LIMIT_MS = 50_000;
const CLEANING_EVENT_CHANCE = 0.02;
const CLEANING_NOTICE_MIN = 2;
const CLEANING_NOTICE_MAX = 12;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function randomId(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function makeUniqueRoomId() {
  let id;
  do {
    id = randomId(6);
  } while (rooms.has(id));
  return id;
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeSettings(raw = {}) {
  let layout = raw.layout === "circle" ? "circle" : "line";
  const urinals = clampInteger(raw.urinals, 8, 40, 12);
  const zero = clampInteger(raw.zero, 0, 1000, 1);
  let white = clampInteger(raw.white, 0, 100, 7);
  let gray = clampInteger(raw.gray, 0, 100, 3);
  let black = clampInteger(raw.black, 0, 100, 1);
  const total = white + gray + black;

  if (total < 7 || total > 100) {
    white = 7;
    gray = 3;
    black = 1;
  }

  const cleaning = Boolean(raw.cleaning);
  const cleaningTurns = clampInteger(raw.cleaningTurns, 2, 50, 10);

  return {
    layout,
    urinals,
    zero,
    white,
    gray,
    black,
    cleaning,
    cleaningTurns,
  };
}

function roomPublicInfo(room) {
  return {
    id: room.id,
    title: room.title,
    locked: Boolean(room.password),
    status: room.status,
    occupancy: room.players.guest ? 2 : 1,
    hostName: room.players.host.name,
    guestName: room.players.guest?.name || null,
    guestReady: room.players.guest?.ready || false,
    settings: room.settings,
  };
}

function getWaitingRooms() {
  return [...rooms.values()]
    .filter((room) => room.status === "waiting")
    .map(roomPublicInfo);
}

function broadcastRoomList() {
  io.emit("room-list", getWaitingRooms());
}

function emitLobbyState(room) {
  io.to(room.id).emit("lobby-state", roomPublicInfo(room));
  broadcastRoomList();
}

function findPlayerByToken(room, token) {
  if (room.players.host.token === token) {
    return { slot: "host", number: 1, player: room.players.host };
  }

  if (room.players.guest?.token === token) {
    return { slot: "guest", number: 2, player: room.players.guest };
  }

  return null;
}

function attachSocketToRoom(socket, room, token) {
  const found = findPlayerByToken(room, token);
  if (!found) return null;

  if (found.player.disconnectTimer) {
    clearTimeout(found.player.disconnectTimer);
    found.player.disconnectTimer = null;
  }

  found.player.socketId = socket.id;
  socket.data.roomId = room.id;
  socket.data.playerToken = token;
  socket.join(room.id);

  return found;
}

function createBaseDeck(settings) {
  const deck = [];

  for (let value = 2; value <= 4; value++) {
    for (let i = 0; i < settings.white; i++) deck.push(value);
  }

  for (let value = 5; value <= 7; value++) {
    for (let i = 0; i < settings.gray; i++) deck.push(value);
  }

  for (let value = 8; value <= 10; value++) {
    for (let i = 0; i < settings.black; i++) deck.push(value);
  }

  for (let i = 0; i < settings.zero; i++) deck.push(0);

  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getNeighborNumbers(settings, number) {
  if (settings.layout === "circle") {
    return [
      number === 1 ? settings.urinals : number - 1,
      number === settings.urinals ? 1 : number + 1,
    ];
  }

  return [number - 1, number + 1].filter(
    (n) => n >= 1 && n <= settings.urinals
  );
}

function isOccupied(game, number) {
  return game.boardPlayers.some((item) => item.urinal === number);
}

function isCleaning(game, number) {
  return (
    game.cleaningEvent?.status === "active" &&
    game.cleaningEvent.urinal === number
  );
}

function hasOccupiedNeighbor(room, number) {
  return getNeighborNumbers(room.settings, number).some((neighbor) =>
    isOccupied(room.game, neighbor)
  );
}

function hasCleaningNeighbor(room, number) {
  if (room.game.cleaningEvent?.status !== "active") return false;
  return getNeighborNumbers(room.settings, number).includes(
    room.game.cleaningEvent.urinal
  );
}

function canUseUrinal(room, number) {
  if (number < 1 || number > room.settings.urinals) return false;
  if (isOccupied(room.game, number)) return false;
  if (isCleaning(room.game, number)) return false;
  if (hasOccupiedNeighbor(room, number)) return false;
  if (hasCleaningNeighbor(room, number)) return false;
  return true;
}

function refillDeck(room) {
  const game = room.game;
  if (game.retiredCards.length === 0) return false;

  game.refillCount += 1;
  const increase = game.refillCount % 2 === 0;

  game.deck = game.retiredCards.map((value) => {
    if (value === 0) return 0;
    return increase ? value + 1 : value;
  });

  game.retiredCards = [];
  shuffle(game.deck);
  return true;
}

function drawCard(room, playerNumber) {
  const game = room.game;

  if (game.deck.length === 0 && !refillDeck(room)) {
    return false;
  }

  const card = game.deck.shift();
  game.hands[playerNumber].push(card);
  return true;
}

function retireCard(room, value) {
  room.game.retiredCards.push(value);
}

function decreaseBoardTurns(room) {
  const game = room.game;

  for (const item of game.boardPlayers) {
    item.remainingTurns -= 1;
  }

  const leaving = game.boardPlayers.filter((item) => item.remainingTurns <= 0);
  for (const item of leaving) {
    retireCard(room, item.originalValue);
  }

  game.boardPlayers = game.boardPlayers.filter(
    (item) => item.remainingTurns > 0
  );
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startCleaning(room) {
  const empty = [];

  for (let number = 1; number <= room.settings.urinals; number++) {
    // 청소는 플레이어 거리 규칙을 무시하고 오직 비어있는지만 확인한다.
    if (!isOccupied(room.game, number)) empty.push(number);
  }

  if (empty.length === 0) {
    room.game.cleaningEvent = null;
    return;
  }

  room.game.cleaningEvent = {
    id: room.game.cleaningEvent.id,
    status: "active",
    urinal: empty[Math.floor(Math.random() * empty.length)],
    remainingTurns: room.settings.cleaningTurns,
  };
}

function processCleaningTurnStart(room) {
  if (!room.settings.cleaning) return;

  const game = room.game;
  const event = game.cleaningEvent;

  if (event?.status === "announced") {
    event.turnsUntilStart -= 1;
    if (event.turnsUntilStart <= 0) startCleaning(room);
    return;
  }

  if (event?.status === "active") {
    event.remainingTurns -= 1;
    if (event.remainingTurns <= 0) game.cleaningEvent = null;
    return;
  }

  if (Math.random() < CLEANING_EVENT_CHANCE) {
    const n = randomInt(CLEANING_NOTICE_MIN, CLEANING_NOTICE_MAX);
    game.cleaningEvent = {
      id: crypto.randomBytes(8).toString("hex"),
      status: "announced",
      turnsUntilStart: n,
      announcedTurns: n,
    };
  }
}

function initializeGame(room) {
  const deck = createBaseDeck(room.settings);
  shuffle(deck);

  room.game = {
    deck,
    retiredCards: [],
    refillCount: 0,
    hands: {
      1: [],
      2: [],
    },
    currentPlayer: 1,
    turnNumber: 1,
    boardPlayers: [],
    cleaningEvent: null,
    turnDeadline: null,
    ended: false,
  };

  for (let i = 0; i < 4; i++) {
    drawCard(room, 1);
    drawCard(room, 2);
  }

  // PLAYER 1의 첫 턴 드로우
  drawCard(room, 1);
  processCleaningTurnStart(room);
  startTurnTimer(room);
}

function getCardColor(value) {
  if (value >= 2 && value <= 4) return "white";
  if (value >= 5 && value <= 7) return "gray";
  return "black";
}

function serializeStateForPlayer(room, playerNumber) {
  const game = room.game;
  const ownHand = [...game.hands[playerNumber]];
  const opponentHand = game.hands[playerNumber === 1 ? 2 : 1];

  return {
    roomId: room.id,
    roomTitle: room.title,
    settings: room.settings,
    playerNumber,
    playerName:
      playerNumber === 1 ? room.players.host.name : room.players.guest.name,
    opponentName:
      playerNumber === 1 ? room.players.guest.name : room.players.host.name,
    currentPlayer: game.currentPlayer,
    turnNumber: game.turnNumber,
    turnDeadline: game.turnDeadline,
    deckCount: game.deck.length,
    refillCount: game.refillCount,
    ownHand,
    opponentCards: opponentHand.map((value) => ({
      color: value === 0 ? "black" : getCardColor(value),
    })),
    boardPlayers: game.boardPlayers.map((item) => ({
      player: item.player,
      urinal: item.urinal,
      originalValue: item.originalValue,
      remainingTurns:
        item.player === playerNumber ? item.remainingTurns : null,
      color: getCardColor(item.originalValue),
    })),
    cleaningEvent: game.cleaningEvent
      ? { ...game.cleaningEvent }
      : null,
  };
}

function emitGameState(room) {
  if (!room.game || room.game.ended) return;

  for (const [slot, number] of [
    ["host", 1],
    ["guest", 2],
  ]) {
    const player = room.players[slot];
    if (!player?.socketId) continue;
    io.to(player.socketId).emit(
      "game-state",
      serializeStateForPlayer(room, number)
    );
  }
}

function clearRoomTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function startTurnTimer(room) {
  clearRoomTurnTimer(room);
  if (!room.game || room.game.ended) return;

  room.game.turnDeadline = Date.now() + TURN_TIME_LIMIT_MS;
  const expectedTurn = room.game.turnNumber;
  const losingPlayer = room.game.currentPlayer;

  room.turnTimer = setTimeout(() => {
    if (
      !room.game ||
      room.game.ended ||
      room.game.turnNumber !== expectedTurn
    ) {
      return;
    }

    finishGame(room, losingPlayer, "시간 초과");
  }, TURN_TIME_LIMIT_MS + 50);
}

function advanceTurn(room) {
  const game = room.game;

  decreaseBoardTurns(room);
  game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
  game.turnNumber += 1;
  drawCard(room, game.currentPlayer);
  processCleaningTurnStart(room);
  startTurnTimer(room);
  emitGameState(room);
}

function finishGame(room, losingPlayer, reason) {
  if (!room.game || room.game.ended) return;

  room.game.ended = true;
  clearRoomTurnTimer(room);

  const winningPlayer = losingPlayer === 1 ? 2 : 1;

  io.to(room.id).emit("game-over", {
    losingPlayer,
    winningPlayer,
    reason,
    loserName:
      losingPlayer === 1 ? room.players.host.name : room.players.guest.name,
    winnerName:
      winningPlayer === 1 ? room.players.host.name : room.players.guest.name,
  });

  setTimeout(() => {
    rooms.delete(room.id);
    broadcastRoomList();
  }, 10_000);
}

function validateGameActor(socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.status !== "playing" || !room.game || room.game.ended) {
    return { error: "게임이 진행 중이 아닙니다." };
  }

  const found = findPlayerByToken(room, socket.data.playerToken);
  if (!found) return { error: "플레이어 정보를 확인할 수 없습니다." };

  return { room, ...found };
}

io.on("connection", (socket) => {
  socket.emit("room-list", getWaitingRooms());

  socket.on("list-rooms", (callback) => {
    callback?.({ ok: true, rooms: getWaitingRooms() });
  });

  socket.on("create-room", (payload = {}, callback) => {
    const title = String(payload.title || "").trim().slice(0, 40);
    const password = String(payload.password || "").trim();
    const name = String(payload.name || "PLAYER").trim().slice(0, 16) || "PLAYER";

    if (!title) {
      callback?.({ ok: false, message: "방 제목을 입력하세요." });
      return;
    }

    if (password && !/^\d{4}$/.test(password)) {
      callback?.({
        ok: false,
        message: "비밀번호는 4자리 숫자로만 설정할 수 있습니다.",
      });
      return;
    }

    const roomId = makeUniqueRoomId();
    const token = makeToken();

    const room = {
      id: roomId,
      title,
      password,
      status: "waiting",
      settings: sanitizeSettings(payload.settings),
      createdAt: Date.now(),
      players: {
        host: {
          token,
          name,
          socketId: socket.id,
          ready: true,
          disconnectTimer: null,
        },
        guest: null,
      },
      game: null,
      turnTimer: null,
    };

    rooms.set(roomId, room);
    attachSocketToRoom(socket, room, token);
    callback?.({
      ok: true,
      roomId,
      playerToken: token,
      room: roomPublicInfo(room),
    });
    emitLobbyState(room);
  });

  socket.on("join-room", (payload = {}, callback) => {
    const room = rooms.get(String(payload.roomId || ""));
    const password = String(payload.password || "").trim();
    const name = String(payload.name || "PLAYER").trim().slice(0, 16) || "PLAYER";

    if (!room || room.status !== "waiting") {
      callback?.({ ok: false, message: "입장할 수 없는 방입니다." });
      return;
    }

    if (room.players.guest) {
      callback?.({ ok: false, message: "이미 인원이 가득 찬 방입니다." });
      return;
    }

    if (room.password && room.password !== password) {
      callback?.({ ok: false, message: "비밀번호가 올바르지 않습니다." });
      return;
    }

    const token = makeToken();
    room.players.guest = {
      token,
      name,
      socketId: socket.id,
      ready: false,
      disconnectTimer: null,
    };

    attachSocketToRoom(socket, room, token);
    callback?.({
      ok: true,
      roomId: room.id,
      playerToken: token,
      room: roomPublicInfo(room),
    });
    emitLobbyState(room);
  });

  socket.on("resume-room", (payload = {}, callback) => {
    const room = rooms.get(String(payload.roomId || ""));
    const token = String(payload.playerToken || "");

    if (!room) {
      callback?.({ ok: false, message: "방을 찾을 수 없습니다." });
      return;
    }

    const found = attachSocketToRoom(socket, room, token);
    if (!found) {
      callback?.({ ok: false, message: "방 참가 정보가 올바르지 않습니다." });
      return;
    }

    callback?.({
      ok: true,
      role: found.slot,
      playerNumber: found.number,
      room: roomPublicInfo(room),
      playing: room.status === "playing",
    });

    if (room.status === "waiting") emitLobbyState(room);
    if (room.status === "playing") emitGameState(room);
  });

  socket.on("leave-room", (payload = {}, callback) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) {
      callback?.({ ok: true });
      return;
    }

    const found = findPlayerByToken(room, socket.data.playerToken);
    if (!found) {
      callback?.({ ok: true });
      return;
    }

    if (room.status === "waiting") {
      if (found.slot === "host") {
        io.to(room.id).emit("room-closed", {
          message: "방장이 나가서 방이 종료되었습니다.",
        });
        rooms.delete(room.id);
      } else {
        room.players.guest = null;
        emitLobbyState(room);
      }
    } else if (room.status === "playing" && room.game && !room.game.ended) {
      finishGame(room, found.number, "기권");
    }

    socket.leave(room.id);
    socket.data.roomId = null;
    socket.data.playerToken = null;
    callback?.({ ok: true });
    broadcastRoomList();
  });

  socket.on("set-ready", (payload = {}, callback) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== "waiting") {
      callback?.({ ok: false, message: "대기 중인 방이 아닙니다." });
      return;
    }

    const found = findPlayerByToken(room, socket.data.playerToken);
    if (!found || found.slot !== "guest") {
      callback?.({ ok: false, message: "참가자만 READY할 수 있습니다." });
      return;
    }

    room.players.guest.ready = true;
    callback?.({ ok: true });
    emitLobbyState(room);
  });

  socket.on("start-room", (payload = {}, callback) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.status !== "waiting") {
      callback?.({ ok: false, message: "게임을 시작할 수 없습니다." });
      return;
    }

    const found = findPlayerByToken(room, socket.data.playerToken);
    if (!found || found.slot !== "host") {
      callback?.({ ok: false, message: "방장만 START할 수 있습니다." });
      return;
    }

    if (!room.players.guest) {
      callback?.({ ok: false, message: "참가자를 기다리고 있습니다." });
      return;
    }

    if (!room.players.guest.ready) {
      callback?.({ ok: false, message: "참가자가 아직 READY하지 않았습니다." });
      return;
    }

    room.status = "playing";
    initializeGame(room);

    callback?.({ ok: true });
    io.to(room.id).emit("game-started", {
      roomId: room.id,
      settings: room.settings,
    });

    // room.html/person.html이 game.html로 이동하면서 소켓 연결이 바뀌므로
    // 실제 state는 game.html의 resume-room 후 다시 전송한다.
    broadcastRoomList();
  });

  socket.on("person-place", (payload = {}, callback) => {
    const actor = validateGameActor(socket);
    if (actor.error) {
      callback?.({ ok: false, message: actor.error });
      return;
    }

    const { room, number } = actor;
    const game = room.game;

    if (game.currentPlayer !== number) {
      callback?.({ ok: false, message: "현재 당신의 턴이 아닙니다." });
      return;
    }

    const cardIndex = Number(payload.cardIndex);
    const urinal = Number(payload.urinal);
    const hand = game.hands[number];

    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= hand.length) {
      callback?.({ ok: false, message: "카드를 다시 선택하세요." });
      return;
    }

    const card = hand[cardIndex];
    if (card === 0) {
      callback?.({ ok: false, message: "0 카드는 변기에 배치할 수 없습니다." });
      return;
    }

    if (!Number.isInteger(urinal) || !canUseUrinal(room, urinal)) {
      callback?.({ ok: false, message: "선택한 변기는 사용할 수 없습니다." });
      return;
    }

    game.boardPlayers.push({
      player: number,
      urinal,
      originalValue: card,
      remainingTurns: card,
    });

    hand.splice(cardIndex, 1);
    callback?.({ ok: true });
    advanceTurn(room);
  });

  socket.on("person-use-zero", (payload = {}, callback) => {
    const actor = validateGameActor(socket);
    if (actor.error) {
      callback?.({ ok: false, message: actor.error });
      return;
    }

    const { room, number } = actor;
    const game = room.game;

    if (game.currentPlayer !== number) {
      callback?.({ ok: false, message: "현재 당신의 턴이 아닙니다." });
      return;
    }

    const cardIndex = Number(payload.cardIndex);
    const hand = game.hands[number];

    if (
      !Number.isInteger(cardIndex) ||
      cardIndex < 0 ||
      cardIndex >= hand.length ||
      hand[cardIndex] !== 0
    ) {
      callback?.({ ok: false, message: "0 카드를 다시 선택하세요." });
      return;
    }

    hand.splice(cardIndex, 1);
    retireCard(room, 0);
    callback?.({ ok: true });
    advanceTurn(room);
  });

  socket.on("person-give-up", (payload = {}, callback) => {
    const actor = validateGameActor(socket);
    if (actor.error) {
      callback?.({ ok: false, message: actor.error });
      return;
    }

    callback?.({ ok: true });
    finishGame(actor.room, actor.number, "기권");
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const token = socket.data.playerToken;
    if (!roomId || !token) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const found = findPlayerByToken(room, token);
    if (!found) return;

    if (found.player.socketId === socket.id) {
      found.player.socketId = null;
    }

    // 페이지 이동/새로고침을 허용하기 위해 30초 유예.
    found.player.disconnectTimer = setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;

      const currentFound = findPlayerByToken(currentRoom, token);
      if (!currentFound || currentFound.player.socketId) return;

      if (currentRoom.status === "waiting") {
        if (currentFound.slot === "host") {
          io.to(currentRoom.id).emit("room-closed", {
            message: "방장이 나가서 방이 종료되었습니다.",
          });
          rooms.delete(currentRoom.id);
        } else {
          currentRoom.players.guest = null;
          emitLobbyState(currentRoom);
        }
      } else if (currentRoom.status === "playing" && currentRoom.game && !currentRoom.game.ended) {
        // 게임 도중 장시간 이탈은 기권 처리.
        finishGame(currentRoom, currentFound.number, "연결 종료");
      }

      broadcastRoomList();
    }, 30_000);
  });
});

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "게임 서버가 실행되었습니다."
        );

        console.log(
            `PORT : ${PORT}`
        );
    }
);