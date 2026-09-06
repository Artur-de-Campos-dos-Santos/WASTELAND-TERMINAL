const socket = io();
const audio = new Audio();

const titleEl = document.getElementById("track-title");
const typeEl = document.getElementById("track-type");
const overlay = document.getElementById("overlay");

let started = false;
let endedEmitted = false;
audio.volume = 0.75;

// --- Click to Start ---
overlay.addEventListener("click", () => {
  started = true;
  overlay.classList.add("hidden");
  socket.emit("radio:clientReady");
  if (window._pendingTrack) {
    playTrack(window._pendingTrack);
    window._pendingTrack = null;
  }
});

// --- Track type labels ---
const TYPE_LABELS = {
  song: "",
  "news-transition": "[ TRANSIÇÃO ]",
  news: "[ NOTÍCIAS ]",
  "news-end": "[ FIM DAS NOTÍCIAS ]",
  flavor: "[ COMENTÁRIO ]",
  "music-flavor": "[ COMENTÁRIO ]",
};

// --- Play audio ---
function playTrack(track) {
  console.log("[RADIO] Playing:", track.type, track.title, track.filePath);
  titleEl.textContent = track.title;
  typeEl.textContent = TYPE_LABELS[track.type] || "";
  endedEmitted = false;
  audio.src = track.filePath;
  audio.load();
  audio.play().then(() => {
    console.log("[RADIO] Playback started successfully");
  }).catch((err) => {
    console.warn("[RADIO] Could not play:", err.message);
  });
}

// --- Emit track ended (with dedup) ---
function emitTrackEnded() {
  if (endedEmitted) return;
  endedEmitted = true;
  console.log("[RADIO] Track ended, notifying server");
  socket.emit("radio:trackEnded");
}

// --- Audio events ---
audio.addEventListener("ended", () => {
  console.log("[RADIO] 'ended' event fired");
  emitTrackEnded();
});

audio.addEventListener("error", (e) => {
  console.error("[RADIO] Audio error:", audio.error?.code, audio.error?.message);
});

audio.addEventListener("stalled", () => {
  console.warn("[RADIO] Audio stalled - buffering");
});

audio.addEventListener("canplay", () => {
  console.log("[RADIO] Audio canplay, duration:", audio.duration);
});

// Fallback: timeupdate detects end even if 'ended' doesn't fire
audio.addEventListener("timeupdate", () => {
  if (audio.duration && audio.currentTime >= audio.duration - 0.1 && audio.duration > 1) {
    emitTrackEnded();
  }
});

// --- Socket Events ---
socket.on("radio:play", (track) => {
  console.log("[RADIO] Received radio:play:", track.type, track.title);
  if (started) {
    playTrack(track);
  } else {
    titleEl.textContent = track.title;
    typeEl.textContent = TYPE_LABELS[track.type] || "";
    window._pendingTrack = track;
  }
});

socket.on("radio:sync", (track) => {
  if (!track) {
    titleEl.textContent = "Aguardando...";
    typeEl.textContent = "";
    return;
  }
  titleEl.textContent = track.title;
  typeEl.textContent = TYPE_LABELS[track.type] || "";
  window._pendingTrack = track;
});

// --- Wave animation (Canvas) ---
const canvas = document.querySelector(".wave-canvas");
const ctx = canvas.getContext("2d");
let frame = 0;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const waves = [
  { amp: 90, freq: 0.015, speed: 3.5, lineWidth: 3, alpha: 0.9 },
  { amp: 130, freq: 0.02, speed: 2.5, lineWidth: 2, alpha: 0.5 },
  { amp: 170, freq: 0.025, speed: 4.5, lineWidth: 1.5, alpha: 0.3 },
];

function animateWaves() {
  frame += 0.08;
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const mid = h / 2;

  ctx.clearRect(0, 0, w, h);

  for (const wave of waves) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(0, 230, 50, ${wave.alpha})`;
    ctx.lineWidth = wave.lineWidth;

    for (let x = 0; x <= w; x += 2) {
      const normX = x / w;
      const envelope = Math.sin(normX * Math.PI);
      const noise = Math.sin(x * 0.03 + frame * 1.3) * 0.5
                  + Math.sin(x * 0.07 + frame * 0.7) * 0.3
                  + Math.sin(x * 0.13 + frame * 2.1) * 0.2;
      const amp = wave.amp * envelope * (0.6 + Math.abs(noise) * 0.5);
      const y = mid + Math.sin(normX * 12 + frame * wave.speed) * amp
              + noise * 30;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  requestAnimationFrame(animateWaves);
}
animateWaves();

// --- Custom Cursor ---
const cursorEl = document.querySelector(".cursor");
let mouseX = 0, mouseY = 0;

document.addEventListener("mousemove", (e) => {
  mouseX = e.pageX;
  mouseY = e.pageY;
});

function drawCursor() {
  cursorEl.style.left = mouseX + "px";
  cursorEl.style.top = mouseY + "px";
  requestAnimationFrame(drawCursor);
}
drawCursor();

const hoverTargets = document.querySelectorAll("a, button, label, input");
for (const el of hoverTargets) {
  el.addEventListener("mouseenter", () => {
    cursorEl.classList.remove("cursor-default");
    cursorEl.classList.add("cursor-active");
  });
  el.addEventListener("mouseleave", () => {
    cursorEl.classList.remove("cursor-active");
    cursorEl.classList.add("cursor-default");
  });
}

const inputTargets = document.querySelectorAll("input, textarea");
for (const el of inputTargets) {
  el.addEventListener("mouseenter", () => {
    cursorEl.classList.add("cursor-input");
  });
  el.addEventListener("mouseleave", () => {
    cursorEl.classList.remove("cursor-input");
  });
}
