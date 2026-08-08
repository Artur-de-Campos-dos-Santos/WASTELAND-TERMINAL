let authenticated = false;
let players = [];
const localIP = window.location.hostname;

const authScreen = document.getElementById("auth-screen");
const dashboard = document.getElementById("dashboard");
const pinInput = document.getElementById("pin-input");
const pinSubmit = document.getElementById("pin-submit");
const pinError = document.getElementById("pin-error");
const playerNameInput = document.getElementById("new-player-name");
const addPlayerBtn = document.getElementById("btn-add-player");
const playersList = document.getElementById("players-list");
const broadcastInput = document.getElementById("broadcast-input");
const broadcastBtn = document.getElementById("btn-broadcast");
const exportCombinedBtn = document.getElementById("btn-export-combined");
const exportAllBtn = document.getElementById("btn-export-all");
const clearLogBtn = document.getElementById("btn-clear-log");
const godView = document.getElementById("god-view");
const presetsGrid = document.getElementById("presets-grid");
const presetForm = document.getElementById("preset-form");

const socket = io();

// ==================== CREATURES ====================

const CREATURES = [
  "Escorpião radioativo",
  "Destroçador",
  "Yao Guai",
  "Super Mutante",
  "Super Mutante Beemote",
  "Necrótico Feroz",
  "Brilhante",
  "Mirelurk",
  "Mirelurk Caçador",
  "Mirelurk Rei",
  "Ratoupeira",
  "Varejeira-Gigante",
  "Ferroasa",
  "Barata Radioativa",
  "Brahmin",
  "Cervo Radioativo",
  "Cão",
  "Sentry Bot",
  "Protectron",
  "Mr. Handy",
  "Mr. Gutsy",
  "Assaultron",
  "Eyebot",
  "Robobrain",
  "Invasor",
  "Tribal",
];

// ==================== PRESETS ====================

const PRESETS = [
  {
    id: "damage",
    icon: "fa-solid fa-fire",
    label: "DANO",
    fields: [
      { name: "target", label: "Alvo", type: "player-or-creature", placeholder: "Quem recebeu o dano?" },
      { name: "amount", label: "Quantidade", type: "number", placeholder: "12" },
    ],
    template: (f) => `${f.target} recebeu ${f.amount} de dano.`,
  },
  {
    id: "heal",
    icon: "fa-solid fa-heart-pulse",
    label: "CURA",
    fields: [
      { name: "target", label: "Alvo", type: "player-or-creature", placeholder: "Quem foi curado?" },
      { name: "amount", label: "Quantidade", type: "number", placeholder: "8" },
    ],
    template: (f) => `${f.target} recuperou ${f.amount} de vida.`,
  },
  {
    id: "critical",
    icon: "fa-solid fa-bolt",
    label: "CRÍTICO",
    fields: [
      { name: "attacker", label: "Atacante", type: "player-or-creature", placeholder: "Quem atacou?" },
      { name: "enemy", label: "Inimigo", type: "player-or-creature", placeholder: "Em quem?" },
      { name: "damage", label: "Dano", type: "number", placeholder: "24" },
    ],
    template: (f) => `${f.attacker} acertou um golpe crítico em ${f.enemy} causando ${f.damage} de dano!`,
  },
  {
    id: "miss",
    icon: "fa-solid fa-xmark",
    label: "ERROU",
    fields: [
      { name: "attacker", label: "Atacante", type: "player-or-creature", placeholder: "Quem errou?" },
      { name: "target", label: "Alvo", type: "player-or-creature", placeholder: "Em quem errou?" },
    ],
    template: (f) => `${f.attacker} errou o ataque em ${f.target}.`,
  },
  {
    id: "travel",
    icon: "fa-solid fa-road",
    label: "VIAGEM",
    fields: [
      { name: "days", label: "Dias", type: "number", placeholder: "3" },
    ],
    template: (f) => `A viagem durou ${f.days} dia${f.days > 1 ? "s" : ""}.`,
  },
  {
    id: "camp",
    icon: "fa-solid fa-campground",
    label: "ACAMPAMENTO",
    fields: [
      { name: "location", label: "Local", type: "text", placeholder: "Ex: Prédio abandonado" },
    ],
    template: (f) => `O grupo acampou em: ${f.location}.`,
  },
  {
    id: "encounter",
    icon: "fa-solid fa-skull-crossbones",
    label: "ENCONTRO",
    fields: [
      { name: "enemy", label: "Inimigo", type: "creature", placeholder: "Qual criatura?" },
    ],
    template: (f) => `Um ${f.enemy} foi avistado!`,
  },
  {
    id: "effect",
    icon: "fa-solid fa-wand-sparkles",
    label: "EFEITO",
    fields: [
      { name: "target", label: "Alvo", type: "player-or-creature", placeholder: "Quem está sob efeito?" },
      { name: "effect", label: "Efeito", type: "text", placeholder: "Ex: RadAway" },
    ],
    template: (f) => `${f.target} está sob efeito de ${f.effect}.`,
  },
  {
    id: "condition",
    icon: "fa-solid fa-face-dizzy",
    label: "CONDIÇÃO",
    fields: [
      { name: "target", label: "Alvo", type: "player-or-creature", placeholder: "Quem está afetado?" },
      {
        name: "condition",
        label: "Condição",
        type: "select",
        options: [
          "Envenenado",
          "Irradiado",
          "Atordoado",
          "Cego",
          "Paralisado",
          "Exausto",
          "Ferido",
          "Queimado",
        ],
      },
    ],
    template: (f) => `${f.target} está ${f.condition.toLowerCase()}.`,
  },
  {
    id: "custom",
    icon: "fa-solid fa-pen",
    label: "PERSONALIZADO",
    fields: [
      { name: "text", label: "Mensagem", type: "text", placeholder: "Digite sua mensagem..." },
    ],
    template: (f) => f.text,
  },
];

let activePreset = null;

function renderPresets() {
  presetsGrid.innerHTML = "";
  for (const preset of PRESETS) {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    btn.dataset.id = preset.id;
    btn.innerHTML = `
      <i class="${preset.icon} preset-icon"></i>
      <span class="preset-label">${preset.label}</span>
    `;
    btn.addEventListener("click", () => openPresetForm(preset));
    presetsGrid.appendChild(btn);
  }
}

function buildFieldHTML(field) {
  if (field.type === "player") {
    const options = players.map((p) => `<option value="${p.display_name}">${p.display_name}</option>`).join("");
    return `
      <div class="field">
        <label>${field.label}</label>
        <select name="${field.name}">
          <option value="">Selecione...</option>
          ${options}
        </select>
      </div>
    `;
  }

  if (field.type === "creature") {
    const options = CREATURES.map((c) => `<option value="${c}">${c}</option>`).join("");
    return `
      <div class="field">
        <label>${field.label}</label>
        <select name="${field.name}">
          <option value="">Selecione...</option>
          ${options}
        </select>
      </div>
    `;
  }

  if (field.type === "player-or-creature") {
    const playerOptions = players.map((p) => `<option value="${p.display_name}">${p.display_name}</option>`).join("");
    const creatureOptions = CREATURES.map((c) => `<option value="${c}">${c}</option>`).join("");
    return `
      <div class="field">
        <label>${field.label}</label>
        <select name="${field.name}">
          <option value="">Selecione...</option>
          <optgroup label="-- Jogadores --">
            ${playerOptions}
          </optgroup>
          <optgroup label="-- Criaturas --">
            ${creatureOptions}
          </optgroup>
        </select>
      </div>
    `;
  }

  if (field.type === "select") {
    const options = field.options.map((o) => `<option value="${o}">${o}</option>`).join("");
    return `
      <div class="field">
        <label>${field.label}</label>
        <select name="${field.name}">${options}</select>
      </div>
    `;
  }

  return `
    <div class="field">
      <label>${field.label}</label>
      <input type="${field.type}" name="${field.name}" placeholder="${field.placeholder}" maxlength="2000">
    </div>
  `;
}

function openPresetForm(preset) {
  activePreset = preset;

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === preset.id);
  });

  let fieldsHTML = "";
  for (const field of preset.fields) {
    fieldsHTML += buildFieldHTML(field);
  }

  presetForm.innerHTML = `
    <h3><i class="${preset.icon}"></i> ${preset.label}</h3>
    <div class="fields">${fieldsHTML}</div>
    <div class="preview" id="preset-preview"></div>
    <div class="actions">
      <button class="btn-send" id="preset-send">ENVIAR</button>
      <button class="btn-cancel" id="preset-cancel">CANCELAR</button>
    </div>
  `;
  presetForm.classList.remove("hidden");

  const inputs = presetForm.querySelectorAll("input, select");
  const updatePreview = () => {
    const data = getPresetData();
    const text = preset.template(data);
    document.getElementById("preset-preview").textContent = text || "...";
  };
  inputs.forEach((input) => {
    input.addEventListener("input", updatePreview);
    input.addEventListener("change", updatePreview);
  });
  updatePreview();

  document.getElementById("preset-send").addEventListener("click", sendPresetMessage);
  document.getElementById("preset-cancel").addEventListener("click", closePresetForm);

  const firstInput = presetForm.querySelector("input, select");
  if (firstInput) firstInput.focus();
}

function getPresetData() {
  const data = {};
  const inputs = presetForm.querySelectorAll("input, select");
  inputs.forEach((input) => {
    data[input.name] = input.value;
  });
  return data;
}

function closePresetForm() {
  activePreset = null;
  presetForm.classList.add("hidden");
  presetForm.innerHTML = "";
  document.querySelectorAll(".preset-btn").forEach((btn) => btn.classList.remove("active"));
}

async function sendPresetMessage() {
  if (!activePreset) return;

  const data = getPresetData();
  const body = activePreset.template(data);

  if (!body.trim()) return;

  try {
    await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "broadcast", body: body.trim() }),
    });
    closePresetForm();
  } catch (e) {
    console.error("Failed to send preset message:", e);
  }
}

// ==================== AUTH ====================

async function init() {
  const res = await fetch("/api/auth/dm/check");
  const data = await res.json();
  if (data.authRequired) {
    authScreen.classList.remove("hidden");
    pinInput.focus();
  } else {
    authenticated = true;
    showDashboard();
  }
}

pinSubmit.addEventListener("click", submitPin);
pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitPin();
});

async function submitPin() {
  const pin = pinInput.value;
  try {
    const res = await fetch("/api/auth/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      authenticated = true;
      showDashboard();
    } else {
      pinError.classList.remove("hidden");
      pinInput.value = "";
      pinInput.focus();
    }
  } catch (e) {
    pinError.textContent = "ERRO DE CONEXÃO";
    pinError.classList.remove("hidden");
  }
}

function showDashboard() {
  authScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  loadPlayers();
  socket.emit("join", "admin");
}

// ==================== SOCKET EVENTS ====================

socket.on("message:new", (msg) => {
  appendGodView(msg);
});

socket.on("terminal:clear", () => {
  godView.innerHTML = '<div class="msg system">[ LOG LIMPO ]</div>';
});

socket.on("players:update", (data) => {
  updatePlayerStatuses(data);
});

// ==================== CLIPBOARD ====================

function copyToClipboard(text, button) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  button.textContent = "COPIADO!";
  setTimeout(() => {
    button.textContent = "COPIAR";
  }, 1500);
}

// ==================== PLAYERS ====================

async function loadPlayers() {
  const res = await fetch("/api/players");
  players = await res.json();
  renderPlayers();
  renderPresets();
}

function renderPlayers() {
  playersList.innerHTML = "";
  for (const player of players) {
    const card = document.createElement("div");
    card.className = "player-card";
    card.dataset.id = player.id;

    const url = `${window.location.protocol}//${localIP}:${window.location.port}/player/${player.id}`;

    card.innerHTML = `
      <div class="status" data-player="${player.id}"></div>
      <div class="name">${player.display_name}</div>
      <div class="url">
        <input type="text" value="${url}" readonly>
        <button class="copy-btn">COPIAR</button>
      </div>
      <button class="send-toggle">ENVIAR</button>
      <button class="remove-btn">REMOVER</button>
    `;

    card.querySelector(".copy-btn").addEventListener("click", function () {
      copyToClipboard(url, this);
    });

    card.querySelector(".send-toggle").addEventListener("click", () => {
      const existing = card.querySelector(".player-send");
      if (existing) {
        existing.remove();
        return;
      }
      const sendDiv = document.createElement("div");
      sendDiv.className = "player-send";
      sendDiv.innerHTML = `
        <input type="text" placeholder="Enviar mensagem para ${player.display_name}..." maxlength="2000">
        <button>ENVIAR</button>
      `;
      sendDiv.querySelector("button").addEventListener("click", () => {
        const input = sendDiv.querySelector("input");
        sendPlayerMessage(player.id, input.value);
        input.value = "";
      });
      sendDiv.querySelector("input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          sendPlayerMessage(player.id, e.target.value);
          e.target.value = "";
        }
      });
      card.appendChild(sendDiv);
      sendDiv.querySelector("input").focus();
    });

    card.querySelector(".remove-btn").addEventListener("click", () => {
      if (confirm(`Remover ${player.display_name}? Isso deletará todas as mensagens.`)) {
        removePlayer(player.id);
      }
    });

    playersList.appendChild(card);
  }
}

addPlayerBtn.addEventListener("click", addPlayer);
playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addPlayer();
});

async function addPlayer() {
  const name = playerNameInput.value.trim();
  if (!name) return;

  try {
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      playerNameInput.value = "";
      loadPlayers();
    }
  } catch (e) {
    console.error("Failed to add player:", e);
  }
}

async function removePlayer(id) {
  try {
    await fetch(`/api/players/${id}`, { method: "DELETE" });
    loadPlayers();
  } catch (e) {
    console.error("Failed to remove player:", e);
  }
}

// ==================== MESSAGES ====================

async function sendPlayerMessage(playerId, body) {
  if (!body.trim()) return;
  try {
    await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "player",
        targetPlayerId: playerId,
        body: body.trim(),
      }),
    });
  } catch (e) {
    console.error("Failed to send message:", e);
  }
}

broadcastBtn.addEventListener("click", sendBroadcast);
broadcastInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBroadcast();
  }
});

async function sendBroadcast() {
  const body = broadcastInput.value.trim();
  if (!body) return;
  try {
    await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "broadcast", body }),
    });
    broadcastInput.value = "";
  } catch (e) {
    console.error("Failed to broadcast:", e);
  }
}

// ==================== GOD VIEW ====================

function appendGodView(msg) {
  const div = document.createElement("div");
  div.className = `msg ${msg.target_type}`;

  const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const target =
    msg.target_type === "broadcast"
      ? "BROADCAST"
      : `→ ${msg.target_player_id}`;

  div.innerHTML = `<span class="target">[${target}]</span> [${time}] ${msg.body}`;
  godView.appendChild(div);
  godView.scrollTop = godView.scrollHeight;
}

// ==================== EXPORT ====================

exportCombinedBtn.addEventListener("click", () => {
  window.location.href = "/api/export/combined";
});

exportAllBtn.addEventListener("click", () => {
  window.location.href = "/api/export/all";
});

// ==================== CLEAR LOG ====================

clearLogBtn.addEventListener("click", async () => {
  if (!confirm("Isso deletará TODAS as mensagens. Jogadores mantêm suas contas. Continuar?")) {
    return;
  }
  try {
    await fetch("/api/session/reset", { method: "POST" });
    godView.innerHTML = '<div class="msg system">[ LOG LIMPO ]</div>';
  } catch (e) {
    console.error("Failed to clear log:", e);
  }
});

// ==================== PLAYER STATUS ====================

function updatePlayerStatuses(data) {
  // Placeholder for real connection tracking
}

// ==================== QUEST JOURNAL ====================

document.getElementById("btn-quest-journal").addEventListener("click", () => {
  window.location.href = "/dm/quests";
});

init();
