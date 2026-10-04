const socket = io();
const params = new URLSearchParams(location.search);
const playerName = (params.get("name") || "PLAYER").trim().slice(0, 16) || "PLAYER";

document.getElementById("player-name-label").textContent = playerName;

const views = {
  mode: document.getElementById("mode-view"),
  create: document.getElementById("create-view"),
  join: document.getElementById("join-view"),
  lobby: document.getElementById("lobby-view"),
};

const settings = {
  layout: "line",
  urinals: 12,
  zero: 1,
  white: 7,
  gray: 3,
  black: 1,
  cleaning: false,
  cleaningTurns: 10,
};

let roomId = sessionStorage.getItem("personRoomId") || "";
let playerToken = sessionStorage.getItem("personPlayerToken") || "";
let role = sessionStorage.getItem("personRole") || "";
let latestLobby = null;

function showView(name) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function showMessage(message, title = "안내") {
  document.getElementById("message-title").textContent = title;
  document.getElementById("message-text").textContent = message;
  document.getElementById("message").classList.add("show");
}

document.getElementById("message-close").addEventListener("click", () => {
  document.getElementById("message").classList.remove("show");
});

function totalSets() {
  return settings.white + settings.gray + settings.black;
}

function updateSettingsUI() {
  document.getElementById("urinals-value").textContent = `${settings.urinals}개`;
  document.getElementById("zero-value").textContent = `${settings.zero}장`;
  document.getElementById("white-value").textContent = `${settings.white}세트`;
  document.getElementById("gray-value").textContent = `${settings.gray}세트`;
  document.getElementById("black-value").textContent = `${settings.black}세트`;
  document.getElementById("cleaningTurns-value").textContent = `${settings.cleaningTurns}턴`;
  document.getElementById("total-value").textContent = `${totalSets()}세트`;

  document.getElementById("layout-line").classList.toggle("selected", settings.layout === "line");
  document.getElementById("layout-circle").classList.toggle("selected", settings.layout === "circle");
  document.getElementById("cleaning-yes").classList.toggle("selected", settings.cleaning);
  document.getElementById("cleaning-no").classList.toggle("selected", !settings.cleaning);
  document.getElementById("cleaning-turn-row").classList.toggle("hidden", !settings.cleaning);
}

function changeSetting(target, delta) {
  if (target === "urinals") {
    const next = settings.urinals + delta;
    if (next < 8 || next > 40) {
      showMessage("변기의 수는 8~40 사이입니다.");
      return;
    }
    settings.urinals = next;
  } else if (target === "zero") {
    settings.zero = Math.max(0, settings.zero + delta);
  } else if (["white", "gray", "black"].includes(target)) {
    if (settings[target] + delta < 0) return;
    const nextTotal = totalSets() + delta;
    if (nextTotal < 7) {
      showMessage("세트의 총합은 최소 7세트입니다.");
      return;
    }
    if (nextTotal > 100) {
      showMessage("세트의 총합은 최대 100세트입니다.");
      return;
    }
    settings[target] += delta;
  } else if (target === "cleaningTurns") {
    const next = settings.cleaningTurns + delta;
    if (next < 2 || next > 50) {
      showMessage("청소시간은 2~50턴 사이입니다.");
      return;
    }
    settings.cleaningTurns = next;
  }

  updateSettingsUI();
}

document.querySelectorAll("[data-target][data-delta]").forEach((button) => {
  button.addEventListener("click", () => {
    changeSetting(button.dataset.target, Number(button.dataset.delta));
  });
});

document.getElementById("layout-line").addEventListener("click", () => {
  settings.layout = "line";
  updateSettingsUI();
});

document.getElementById("layout-circle").addEventListener("click", () => {
  settings.layout = "circle";
  updateSettingsUI();
});

document.getElementById("cleaning-yes").addEventListener("click", () => {
  settings.cleaning = true;
  updateSettingsUI();
});

document.getElementById("cleaning-no").addEventListener("click", () => {
  settings.cleaning = false;
  updateSettingsUI();
});


document.getElementById("cleaning-info").addEventListener("click", () => {
  showMessage("게임중 무작위로 청소시간이 예고됩니다. 예고 후 비어있는 변기중 한변기를 설정한 턴동안 청소합니다. 청소중인 변기 옆에 설 수 없습니다. 청소 이벤트의 발생 확률은 2%입니다", "청소 이벤트");
});

document.getElementById("room-password").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
});

document.getElementById("show-create").addEventListener("click", () => showView("create"));
document.getElementById("show-join").addEventListener("click", () => {
  showView("join");
  requestRooms();
});
document.getElementById("create-cancel").addEventListener("click", () => showView("mode"));
document.getElementById("join-cancel").addEventListener("click", () => showView("mode"));
document.getElementById("back-main").addEventListener("click", () => location.href = "/");
document.getElementById("refresh-rooms").addEventListener("click", requestRooms);

function saveRoomSession(id, token, newRole) {
  roomId = id;
  playerToken = token;
  role = newRole;
  sessionStorage.setItem("personRoomId", id);
  sessionStorage.setItem("personPlayerToken", token);
  sessionStorage.setItem("personRole", newRole);
}

function clearRoomSession() {
  roomId = "";
  playerToken = "";
  role = "";
  latestLobby = null;
  sessionStorage.removeItem("personRoomId");
  sessionStorage.removeItem("personPlayerToken");
  sessionStorage.removeItem("personRole");
}

document.getElementById("create-room").addEventListener("click", () => {
  const title = document.getElementById("room-title").value.trim();
  const password = document.getElementById("room-password").value.trim();

  if (!title) {
    showMessage("방 제목을 입력하세요.");
    return;
  }

  if (password && !/^\d{4}$/.test(password)) {
    showMessage("비밀번호는 4자리 숫자로만 설정할 수 있습니다.");
    return;
  }

  socket.emit("create-room", {
    title,
    password,
    name: playerName,
    settings,
  }, (result) => {
    if (!result?.ok) {
      showMessage(result?.message || "방을 만들 수 없습니다.");
      return;
    }

    saveRoomSession(result.roomId, result.playerToken, "host");
    renderLobby(result.room);
    showView("lobby");
  });
});

function requestRooms() {
  socket.emit("list-rooms", (result) => {
    if (result?.ok) renderRoomList(result.rooms);
  });
}

function settingsText(s) {
  return `변기 ${s.urinals} · 0카드 ${s.zero} · 흰 ${s.white} · 회 ${s.gray} · 검 ${s.black} · 청소 ${s.cleaning ? `YES(${s.cleaningTurns}턴)` : "NO"}`;
}

function renderRoomList(rooms) {
  const container = document.getElementById("room-list");
  container.innerHTML = "";

  if (!rooms.length) {
    container.innerHTML = '<div class="empty">현재 참가 가능한 방이 없습니다.</div>';
    return;
  }

  rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "room-item";

    const info = document.createElement("div");
    info.innerHTML = `
      <div class="room-title">${escapeHtml(room.title)} ${room.locked ? "🔒" : ""}</div>
      <div class="room-meta">방장: ${escapeHtml(room.hostName)} · ${room.occupancy}/2<br>${settingsText(room.settings)}</div>
    `;

    const button = document.createElement("button");
    button.textContent = room.occupancy >= 2 ? "FULL" : "입장";
    button.disabled = room.occupancy >= 2;
    button.addEventListener("click", () => joinRoom(room));

    item.append(info, button);
    container.appendChild(item);
  });
}

function joinRoom(room) {
  let password = "";
  if (room.locked) {
    password = prompt("4자리 비밀번호를 입력하세요.") || "";
    if (!/^\d{4}$/.test(password)) {
      showMessage("비밀번호는 4자리 숫자입니다.");
      return;
    }
  }

  socket.emit("join-room", {
    roomId: room.id,
    password,
    name: playerName,
  }, (result) => {
    if (!result?.ok) {
      showMessage(result?.message || "방에 입장할 수 없습니다.");
      return;
    }

    saveRoomSession(result.roomId, result.playerToken, "guest");
    renderLobby(result.room);
    showView("lobby");
  });
}

function renderLobby(room) {
  latestLobby = room;
  document.getElementById("lobby-title").textContent = room.title;
  document.getElementById("lobby-code").textContent = `ROOM ${room.id}${room.locked ? " · 비밀번호 설정됨" : ""}`;
  document.getElementById("host-name").textContent = room.hostName;
  document.getElementById("guest-name").textContent = room.guestName || "대기 중";

  const readyState = document.getElementById("guest-ready-state");
  if (!room.guestName) {
    readyState.textContent = "참가자 대기 중";
    readyState.className = "ready-state waiting";
  } else if (room.guestReady) {
    readyState.textContent = "READY";
    readyState.className = "ready-state ready";
  } else {
    readyState.textContent = "NOT READY";
    readyState.className = "ready-state waiting";
  }

  const summary = document.getElementById("lobby-summary");
  const s = room.settings;
  summary.innerHTML = [
    ["배치", s.layout === "circle" ? "원형" : "직선"],
    ["변기", `${s.urinals}개`],
    ["0 카드", `${s.zero}장`],
    ["흰색", `${s.white}세트`],
    ["회색", `${s.gray}세트`],
    ["검정", `${s.black}세트`],
    ["청소", s.cleaning ? `YES / ${s.cleaningTurns}턴` : "NO"],
  ].map(([label, value]) => `<div class="summary-item"><div class="summary-label">${label}</div><div class="summary-value">${value}</div></div>`).join("");

  const readyButton = document.getElementById("ready-button");
  const startButton = document.getElementById("start-button");

  readyButton.classList.toggle("hidden", role !== "guest");
  startButton.classList.toggle("hidden", role !== "host");

  if (role === "guest") {
    readyButton.disabled = Boolean(room.guestReady);
    readyButton.textContent = room.guestReady ? "READY 완료" : "READY";
  }

  if (role === "host") {
    startButton.disabled = !(room.guestName && room.guestReady);
  }
}

document.getElementById("ready-button").addEventListener("click", () => {
  socket.emit("set-ready", {}, (result) => {
    if (!result?.ok) showMessage(result?.message || "READY할 수 없습니다.");
  });
});

document.getElementById("start-button").addEventListener("click", () => {
  socket.emit("start-room", {}, (result) => {
    if (!result?.ok) showMessage(result?.message || "게임을 시작할 수 없습니다.");
  });
});

document.getElementById("lobby-exit").addEventListener("click", () => {
  socket.emit("leave-room", {}, () => {
    clearRoomSession();
    location.href = `person.html?name=${encodeURIComponent(playerName)}`;
  });
});

socket.on("room-list", (rooms) => {
  if (!views.join.classList.contains("hidden")) renderRoomList(rooms);
});

socket.on("lobby-state", (room) => {
  if (room.id !== roomId) return;
  renderLobby(room);
  showView("lobby");
});

socket.on("room-closed", (data) => {
  clearRoomSession();
  showMessage(data?.message || "방이 종료되었습니다.");
  showView("mode");
});

socket.on("game-started", ({ roomId: startedRoomId, settings: roomSettings }) => {
  if (startedRoomId !== roomId) return;
  const q = new URLSearchParams({
    mode: "person",
    room: roomId,
    token: playerToken,
    name: playerName,
    layout: roomSettings.layout,
    urinals: roomSettings.urinals,
    zero: roomSettings.zero,
    white: roomSettings.white,
    gray: roomSettings.gray,
    black: roomSettings.black,
    cleaning: roomSettings.cleaning ? "yes" : "no",
    cleaningTurns: roomSettings.cleaningTurns,
  });
  location.href = `game.html?${q.toString()}`;
});

socket.on("connect", () => {
  if (!roomId || !playerToken) return;

  socket.emit("resume-room", {
    roomId,
    playerToken,
  }, (result) => {
    if (!result?.ok) {
      clearRoomSession();
      return;
    }

    role = result.role;
    sessionStorage.setItem("personRole", role);

    if (result.playing) {
      const s = result.room.settings;
      const q = new URLSearchParams({
        mode: "person",
        room: roomId,
        token: playerToken,
        name: playerName,
        layout: s.layout,
        urinals: s.urinals,
        zero: s.zero,
        white: s.white,
        gray: s.gray,
        black: s.black,
        cleaning: s.cleaning ? "yes" : "no",
        cleaningTurns: s.cleaningTurns,
      });
      location.href = `game.html?${q.toString()}`;
      return;
    }

    renderLobby(result.room);
    showView("lobby");
  });
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateSettingsUI();
