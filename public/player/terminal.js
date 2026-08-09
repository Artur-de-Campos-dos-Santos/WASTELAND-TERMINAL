const playerId = window.location.pathname.split("/player/")[1];
const output = document.getElementById("output");
const screen = document.getElementById("screen");

document.title = `TERMINAL // ${playerId}`;

const socket = io();

socket.on("connect", () => {
  socket.emit("join", `player:${playerId}`);
  loadHistory();
});

socket.on("message:new", (msg) => {
  appendMessage(msg, true);
});

socket.on("terminal:clear", () => {
  output.innerHTML = "";
  const line = appendSystemLine("[ TERMINAL LIMPA ]");
  setTimeout(() => {
    line.style.transition = "opacity 1s";
    line.style.opacity = "0";
    setTimeout(() => line.remove(), 1000);
  }, 3000);
});

socket.on("player:removed", () => {
  output.innerHTML = "";
  appendSystemLine("[ JOGADOR REMOVIDO — CONTATE O MESTRE ]");
});

socket.on("error", (err) => {
  appendSystemLine(`[ ERRO: ${err.message} ]`);
});

// Listen for theme changes
fetch("/api/config/theme")
  .then((r) => r.json())
  .then((data) => {
    document.body.className = "theme-" + data.theme;
  });

socket.on("theme:changed", (data) => {
  document.body.className = "theme-" + data.theme;
});

async function loadHistory() {
  try {
    const res = await fetch(`/api/messages/${playerId}`);
    if (!res.ok) {
      appendSystemLine("[ FALHA AO CARREGAR HISTÓRICO ]");
      return;
    }
    const messages = await res.json();
    for (const msg of messages) {
      appendMessage(msg, false);
    }
  } catch (e) {
    appendSystemLine("[ ERRO DE CONEXÃO ]");
  }
}

function appendMessage(msg, typewrite) {
  const line = document.createElement("div");
  line.className = `line ${msg.target_type}`;

  const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const text = `[${time}] ${msg.body}`;

  if (typewrite) {
    typewriteText(line, text);
  } else {
    line.textContent = text;
  }

  output.appendChild(line);
  autoScroll();
}

function appendSystemLine(text) {
  const line = document.createElement("div");
  line.className = "line system";
  line.textContent = text;
  output.appendChild(line);
  autoScroll();
  return line;
}

function typewriteText(element, text) {
  let i = 0;
  const interval = setInterval(() => {
    element.textContent += text[i];
    i++;
    autoScroll();
    if (i >= text.length) {
      clearInterval(interval);
    }
  }, 18);
}

function autoScroll() {
  if (screen.scrollHeight - screen.scrollTop - screen.clientHeight < 100) {
    screen.scrollTop = screen.scrollHeight;
  }
}
