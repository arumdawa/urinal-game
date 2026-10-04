const socket = io();
const personParams = new URLSearchParams(window.location.search);
const roomId = personParams.get("room") || sessionStorage.getItem("personRoomId") || "";
const playerToken = personParams.get("token") || sessionStorage.getItem("personPlayerToken") || "";

let state = null;
let selectedCardIndex = null;
let selectedUrinalNumber = null;
let lastCleaningNoticeId = null;
let cleaningNoticeInterval = null;
let cleaningNoticeTimeout = null;
let timerInterval = null;
var cleaningEvent = null;
window.cleaningEvent = cleaningEvent;

const board = document.getElementById("urinal-board");
const myCards = document.getElementById("my-cards");
const turnNumberElement = document.getElementById("turn-number");
const myPlayerName = document.getElementById("my-player-name");
const opponentCards = document.querySelector(".opponent-cards");
const opponentPlayerName = document.querySelector(".player-area.opponent .player-name");
const endButton = document.getElementById("end-button");
const giveUpButton = document.getElementById("give-up-button");

const turnStatusRow = document.createElement("div");
turnStatusRow.style.display = "flex";
turnStatusRow.style.justifyContent = "center";
turnStatusRow.style.alignItems = "center";
turnStatusRow.style.gap = "18px";
turnStatusRow.style.margin = "6px 0";

const turnTimerElement = document.createElement("div");
turnTimerElement.style.padding = "6px 12px";
turnTimerElement.style.background = "rgba(0,0,0,0.65)";
turnTimerElement.style.border = "1px solid rgba(255,255,255,0.35)";
turnTimerElement.style.borderRadius = "8px";
turnTimerElement.style.fontWeight = "bold";
turnTimerElement.style.whiteSpace = "nowrap";

const turnNumberParent = turnNumberElement.parentElement;
if (turnNumberParent) {
  turnNumberParent.insertBefore(turnStatusRow, turnNumberElement);
  turnStatusRow.appendChild(turnTimerElement);
  turnStatusRow.appendChild(turnNumberElement);
}

const deckInfoPanel = document.createElement("div");
deckInfoPanel.style.width = "fit-content";
deckInfoPanel.style.minWidth = "140px";
deckInfoPanel.style.margin = "8px auto 16px";
deckInfoPanel.style.padding = "7px 16px";
deckInfoPanel.style.background = "rgba(0,0,0,0.65)";
deckInfoPanel.style.border = "1px solid rgba(255,255,255,0.3)";
deckInfoPanel.style.borderRadius = "8px";
deckInfoPanel.style.fontSize = "14px";
deckInfoPanel.style.fontWeight = "bold";
deckInfoPanel.style.textAlign = "center";
deckInfoPanel.style.lineHeight = "1.5";
turnStatusRow.insertAdjacentElement("afterend", deckInfoPanel);

const cleaningNoticeElement = document.createElement("div");
cleaningNoticeElement.style.position = "fixed";
cleaningNoticeElement.style.top = "22%";
cleaningNoticeElement.style.left = "50%";
cleaningNoticeElement.style.transform = "translateX(-50%)";
cleaningNoticeElement.style.padding = "14px 26px";
cleaningNoticeElement.style.background = "rgba(0,80,150,.9)";
cleaningNoticeElement.style.border = "2px solid #6ec6ff";
cleaningNoticeElement.style.borderRadius = "10px";
cleaningNoticeElement.style.fontSize = "20px";
cleaningNoticeElement.style.fontWeight = "bold";
cleaningNoticeElement.style.zIndex = "5000";
cleaningNoticeElement.style.pointerEvents = "none";
cleaningNoticeElement.style.display = "none";
document.body.appendChild(cleaningNoticeElement);

function showCleaningNotice(turns) {
  clearInterval(cleaningNoticeInterval);
  clearTimeout(cleaningNoticeTimeout);
  cleaningNoticeElement.textContent = `앞으로 ${turns}턴 후 청소가 시작됩니다.`;
  cleaningNoticeElement.style.display = "block";
  cleaningNoticeElement.style.opacity = "1";
  let visible = true;
  cleaningNoticeInterval = setInterval(() => {
    visible = !visible;
    cleaningNoticeElement.style.opacity = visible ? "1" : ".2";
  }, 350);
  cleaningNoticeTimeout = setTimeout(() => {
    clearInterval(cleaningNoticeInterval);
    cleaningNoticeElement.style.display = "none";
    cleaningNoticeElement.style.opacity = "1";
  }, 5000);
}

function getCardClass(value) {
  if (value === 0) return "card-zero";
  if (value >= 2 && value <= 4) return "card-white";
  if (value >= 5 && value <= 7) return "card-gray";
  return "card-black";
}

function getNeighborNumbers(number) {
  if (!state) return [];
  const count = state.settings.urinals;
  if (state.settings.layout === "circle") {
    return [number === 1 ? count : number - 1, number === count ? 1 : number + 1];
  }
  return [number - 1, number + 1].filter((n) => n >= 1 && n <= count);
}

function isOccupied(number) {
  return state.boardPlayers.some((item) => item.urinal === number);
}

function isCleaning(number) {
  return state.cleaningEvent?.status === "active" && state.cleaningEvent.urinal === number;
}

function canSelectUrinal(number) {
  if (!state || state.currentPlayer !== state.playerNumber) return false;
  if (isOccupied(number) || isCleaning(number)) return false;
  if (getNeighborNumbers(number).some(isOccupied)) return false;
  if (
    state.cleaningEvent?.status === "active" &&
    getNeighborNumbers(number).includes(state.cleaningEvent.urinal)
  ) return false;
  return true;
}

function ensureBoard() {
  if (!state) return;
  const count = state.settings.urinals;
  if (board.children.length === count) return;

  board.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const urinal = document.createElement("div");
    urinal.className = "urinal";
    urinal.dataset.number = i;
    urinal.textContent = i;
    urinal.addEventListener("click", () => {
      if (!canSelectUrinal(i)) return;
      selectedUrinalNumber = i;
      renderBoard();
    });
    board.appendChild(urinal);
  }

  renderBoardLayout();
}

function renderBoardLayout() {
  if (!state) return;
  const urinals = [...board.querySelectorAll(".urinal")];
  const count = state.settings.urinals;
  board.style.marginLeft = "auto";
  board.style.marginRight = "auto";
  board.style.boxSizing = "border-box";

  if (state.settings.layout === "line") {
    const columns = Math.min(12, count);
    board.style.display = "grid";
    board.style.position = "relative";
    board.style.width = "min(96vw, 1100px)";
    board.style.height = "auto";
    board.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    board.style.columnGap = "10px";
    board.style.rowGap = "34px";
    board.style.padding = "10px 12px 28px";
    board.style.minWidth = "0";

    urinals.forEach((urinal) => {
      urinal.style.position = "relative";
      urinal.style.left = "";
      urinal.style.top = "";
      urinal.style.transform = "";
      urinal.style.width = "100%";
      urinal.style.maxWidth = "72px";
      urinal.style.minWidth = "0";
      urinal.style.height = "64px";
      urinal.style.margin = "0 auto 26px";
      urinal.style.fontSize = count > 24 ? "15px" : "18px";
    });
    return;
  }

  board.style.display = "block";
  board.style.position = "relative";
  board.style.width = "min(78vh, 86vw, 820px)";
  board.style.height = "min(78vh, 86vw, 820px)";
  board.style.minWidth = "0";
  board.style.padding = "0";

  let tileSize = 58;
  if (count > 20) tileSize = 52;
  if (count > 28) tileSize = 46;
  if (count > 34) tileSize = 42;
  const radiusPercent = count > 30 ? 44 : 41;

  urinals.forEach((urinal, index) => {
    const angle = Math.PI * 2 * index / count - Math.PI / 2;
    const x = 50 + Math.cos(angle) * radiusPercent;
    const y = 50 + Math.sin(angle) * radiusPercent;
    urinal.style.position = "absolute";
    urinal.style.left = `${x}%`;
    urinal.style.top = `${y}%`;
    urinal.style.transform = "translate(-50%, -50%)";
    urinal.style.width = `${tileSize}px`;
    urinal.style.minWidth = `${tileSize}px`;
    urinal.style.maxWidth = `${tileSize}px`;
    urinal.style.height = `${tileSize}px`;
    urinal.style.margin = "0";
    urinal.style.fontSize = count > 28 ? "13px" : "16px";
  });
}

function renderCards() {
  myCards.innerHTML = "";
  state.ownHand.forEach((value, index) => {
    const card = document.createElement("div");
    card.className = `card ${getCardClass(value)}`;
    card.textContent = value;
    if (index === selectedCardIndex) card.classList.add("selected");
    card.addEventListener("click", () => {
      if (state.currentPlayer !== state.playerNumber) return;
      selectedCardIndex = index;
      renderCards();
    });
    myCards.appendChild(card);
  });
}

function renderOpponentCards() {
  opponentCards.innerHTML = "";
  state.opponentCards.forEach(({ color }) => {
    const card = document.createElement("div");
    card.className = "hidden-card";
    card.style.backgroundImage = "none";
    if (color === "white") {
      card.style.background = "white";
      card.style.border = "3px solid #aaa";
    } else if (color === "gray") {
      card.style.background = "#777";
      card.style.border = "3px solid #999";
    } else {
      card.style.background = "#111";
      card.style.border = "3px solid #333";
    }
    opponentCards.appendChild(card);
  });
}

function renderBoard() {
  ensureBoard();
  board.querySelectorAll(".urinal").forEach((urinal) => {
    const number = Number(urinal.dataset.number);
    const item = state.boardPlayers.find((person) => person.urinal === number);
    urinal.classList.toggle("occupied", Boolean(item));
    urinal.style.boxShadow = number === selectedUrinalNumber
      ? "0 0 0 3px rgba(77,166,255,.35)"
      : "";

    urinal.querySelectorAll(".remaining-turns").forEach((node) => node.remove());

    if (isCleaning(number)) {
      urinal.style.background = "#1689d8";
      urinal.style.color = "white";
      urinal.style.borderColor = "#74c7ff";
      addRemainingText(urinal, `청소: ${state.cleaningEvent.remainingTurns}턴`, "#6ec6ff");
      return;
    }

    if (!item) {
      urinal.style.background = "";
      urinal.style.color = "";
      urinal.style.borderColor = "";
      return;
    }

    if (item.color === "white") {
      urinal.style.background = "white";
      urinal.style.color = "#111";
      urinal.style.borderColor = "#aaa";
    } else if (item.color === "gray") {
      urinal.style.background = "#777";
      urinal.style.color = "white";
      urinal.style.borderColor = "#999";
    } else {
      urinal.style.background = "#111";
      urinal.style.color = "white";
      urinal.style.borderColor = "#333";
    }

    if (item.remainingTurns !== null) {
      addRemainingText(urinal, `남은 턴: ${item.remainingTurns}`, "white");
    }
  });
}

function addRemainingText(urinal, text, color) {
  const display = document.createElement("div");
  display.className = "remaining-turns";
  display.textContent = text;
  display.style.position = "absolute";
  display.style.top = "100%";
  display.style.left = "50%";
  display.style.transform = "translateX(-50%)";
  display.style.marginTop = "5px";
  display.style.whiteSpace = "nowrap";
  display.style.fontSize = state.settings.urinals > 24 ? "11px" : "14px";
  display.style.fontWeight = "bold";
  display.style.color = color;
  display.style.textShadow = "0 1px 3px black";
  display.style.pointerEvents = "none";
  urinal.style.position = urinal.style.position || "relative";
  urinal.appendChild(display);
}

function renderHeader() {
  turnNumberElement.textContent = state.turnNumber;
  myPlayerName.textContent = state.playerName;
  opponentPlayerName.textContent = state.opponentName;
  deckInfoPanel.innerHTML = `<div>남은 덱: ${state.deckCount}장</div><div>리필: ${state.refillCount}회</div>`;

  const myTurn = state.currentPlayer === state.playerNumber;
  endButton.disabled = !myTurn;
  giveUpButton.disabled = false;
}

function renderAll() {
  if (!state) return;
  cleaningEvent = state.cleaningEvent;
  window.cleaningEvent = cleaningEvent;
  renderHeader();
  renderCards();
  renderOpponentCards();
  renderBoard();

  if (
    state.cleaningEvent?.status === "announced" &&
    state.cleaningEvent.id &&
    state.cleaningEvent.id !== lastCleaningNoticeId
  ) {
    lastCleaningNoticeId = state.cleaningEvent.id;
    showCleaningNotice(state.cleaningEvent.turnsUntilStart);
  }
}

function updateTimer() {
  if (!state?.turnDeadline) return;
  const ms = Math.max(0, state.turnDeadline - Date.now());
  const seconds = Math.ceil(ms / 1000);
  turnTimerElement.textContent = `남은 시간: ${seconds}초`;
  turnTimerElement.style.color = seconds <= 10 ? "#ff6b6b" : "white";
  turnTimerElement.style.borderColor = seconds <= 10 ? "#ff6b6b" : "rgba(255,255,255,.35)";
}

timerInterval = setInterval(updateTimer, 250);

endButton.addEventListener("click", () => {
  if (!state || state.currentPlayer !== state.playerNumber) return;
  if (selectedCardIndex === null) {
    alert("카드를 먼저 선택하세요.");
    return;
  }

  const value = state.ownHand[selectedCardIndex];
  if (value === 0) {
    socket.emit("person-use-zero", { cardIndex: selectedCardIndex }, handleActionResult);
    return;
  }

  if (selectedUrinalNumber === null) {
    alert("변기를 선택하세요.");
    return;
  }

  socket.emit("person-place", {
    cardIndex: selectedCardIndex,
    urinal: selectedUrinalNumber,
  }, handleActionResult);
});

function handleActionResult(result) {
  if (!result?.ok) {
    alert(result?.message || "행동을 처리할 수 없습니다.");
    return;
  }
  selectedCardIndex = null;
  selectedUrinalNumber = null;
}

giveUpButton.addEventListener("click", () => {
  if (!confirm("기권하시겠습니까?")) return;
  socket.emit("person-give-up", {}, (result) => {
    if (!result?.ok) alert(result?.message || "기권 처리에 실패했습니다.");
  });
});

socket.on("game-state", (nextState) => {
  state = nextState;
  selectedCardIndex = null;
  selectedUrinalNumber = null;
  renderAll();
  updateTimer();
});

socket.on("game-over", (result) => {
  clearInterval(timerInterval);
  clearInterval(cleaningNoticeInterval);
  clearTimeout(cleaningNoticeTimeout);

  let message;
  if (result.reason === "시간 초과") {
    message = `${result.loserName}의 제한시간 50초가 종료되었습니다.\n\n자동 기권 처리됩니다.\n\n${result.winnerName}의 승리입니다.`;
  } else if (result.reason === "연결 종료") {
    message = `${result.loserName}의 연결이 종료되었습니다.\n\n${result.winnerName}의 승리입니다.`;
  } else {
    message = `${result.loserName}의 기권입니다.\n\n${result.winnerName}의 승리입니다.`;
  }

  alert(message);
  sessionStorage.removeItem("personRoomId");
  sessionStorage.removeItem("personPlayerToken");
  sessionStorage.removeItem("personRole");
  location.href = "/";
});

socket.on("room-closed", (data) => {
  alert(data?.message || "방이 종료되었습니다.");
  location.href = "/";
});

socket.on("connect", () => {
  if (!roomId || !playerToken) {
    alert("방 참가 정보를 찾을 수 없습니다.");
    location.href = "/";
    return;
  }

  socket.emit("resume-room", { roomId, playerToken }, (result) => {
    if (!result?.ok || !result.playing) {
      alert(result?.message || "진행 중인 게임을 찾을 수 없습니다.");
      location.href = "/";
    }
  });
});

window.addEventListener("resize", () => {
  if (state) {
    renderBoardLayout();
    renderBoard();
  }
});
