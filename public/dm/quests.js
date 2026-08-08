// --- State ---
let quests = [];
let selectedQuestId = null;
let selectedQuestStages = [];
let dragState = null;

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  loadQuests();
  setupEventListeners();
});

// --- API helpers ---
async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error);
  }
  return res.json();
}

// --- Quest CRUD ---
async function loadQuests() {
  quests = await api("GET", "/quests");
  renderQuestList();
}

async function createQuest() {
  const name = prompt("Nome da missão:");
  if (!name) return;
  const quest = await api("POST", "/quests", { name });
  quests.push(quest);
  renderQuestList();
  selectQuest(quest.id);
}

async function updateQuest(id, data) {
  const updated = await api("PUT", `/quests/${id}`, data);
  const idx = quests.findIndex(q => q.id === id);
  if (idx !== -1) quests[idx] = updated;
  renderQuestList();
}

async function deleteQuest(id) {
  if (!confirm("Tem certeza que deseja excluir esta missão?")) return;
  await api("DELETE", `/quests/${id}`);
  quests = quests.filter(q => q.id !== id);
  selectedQuestId = null;
  renderQuestList();
  renderQuestDetail();
}

// --- Stage CRUD ---
async function loadStages(questId) {
  selectedQuestStages = await api("GET", `/quests/${questId}/stages`);
  renderStages();
}

async function addStage(questId) {
  const stage = await api("POST", `/quests/${questId}/stages`, { name: "Novo estágio" });
  selectedQuestStages.push(stage);
  renderStages();
  // Focus the new stage name for editing
  const nameInputs = document.querySelectorAll(".stage-name-input");
  if (nameInputs.length) nameInputs[nameInputs.length - 1].focus();
}

async function updateStage(questId, stageId, data) {
  const updated = await api("PUT", `/quests/${questId}/stages/${stageId}`, data);
  const idx = selectedQuestStages.findIndex(s => s.id === stageId);
  if (idx !== -1) selectedQuestStages[idx] = updated;
  renderStages();
  renderQuestList(); // Update status indicators if needed
  return updated;
}

async function deleteStage(questId, stageId) {
  if (!confirm("Excluir este estágio?")) return;
  await api("DELETE", `/quests/${questId}/stages/${stageId}`);
  selectedQuestStages = selectedQuestStages.filter(s => s.id !== stageId);
  renderStages();
}

async function reorderStages(questId, stageIds) {
  await api("PUT", `/quests/${questId}/stages/reorder`, { stageIds });
  await loadStages(questId);
}

// --- Rendering ---
function renderQuestList() {
  const container = document.getElementById("quest-list");
  if (!quests.length) {
    container.innerHTML = '<p class="empty-text">Nenhuma missão ainda.</p>';
    return;
  }

  container.innerHTML = quests.map(q => {
    const statusIcon = q.status === "active" ? "●"
      : q.status === "completed" ? "✓" : "✗";
    const statusClass = q.status === "completed" ? "completed"
      : q.status === "failed" ? "failed" : "";
    const activeClass = q.id === selectedQuestId ? "active" : "";

    return `
      <div class="quest-item ${activeClass}" data-id="${q.id}">
        <span class="quest-status ${statusClass}">${statusIcon}</span>
        <span class="quest-name">${escapeHtml(q.name)}</span>
      </div>
    `;
  }).join("");

  // Attach click listeners
  container.querySelectorAll(".quest-item").forEach(el => {
    el.addEventListener("click", () => selectQuest(parseInt(el.dataset.id)));
  });
}

function renderQuestDetail() {
  const detail = document.getElementById("quest-detail");
  const empty = document.getElementById("quest-empty");

  if (!selectedQuestId) {
    detail.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  detail.classList.remove("hidden");
  empty.classList.add("hidden");

  const quest = quests.find(q => q.id === selectedQuestId);
  if (!quest) return;

  document.getElementById("quest-name").value = quest.name;
  document.getElementById("quest-description").value = quest.description || "";
  document.getElementById("quest-status").value = quest.status;
}

function renderStages() {
  const container = document.getElementById("stages-list");

  if (!selectedQuestStages.length) {
    container.innerHTML = '<p class="empty-text">Nenhum estágio. Adicione um!</p>';
    return;
  }

  container.innerHTML = selectedQuestStages.map(stage => {
    const doneClass = stage.is_done ? "done" : "";
    const broadcastPreview = stage.broadcast_text
      ? `<span class="broadcast-preview">${escapeHtml(stage.broadcast_text.substring(0, 40))}${stage.broadcast_text.length > 40 ? "..." : ""}</span>`
      : '<span class="broadcast-preview none">(nenhum)</span>';

    return `
      <div class="stage-row ${doneClass}" data-id="${stage.id}" draggable="true">
        <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
        <input type="checkbox" class="stage-checkbox" ${stage.is_done ? "checked" : ""}>
        <input type="text" class="stage-name-input" value="${escapeHtml(stage.name)}" placeholder="Nome do estágio">
        <div class="stage-broadcast">
          <textarea class="stage-broadcast-input" placeholder="Texto do broadcast (opcional)">${escapeHtml(stage.broadcast_text || "")}</textarea>
          ${broadcastPreview}
        </div>
        <button class="stage-delete-btn" title="Excluir estágio"><i class="fas fa-times"></i></button>
      </div>
    `;
  }).join("");

  attachStageListeners();
  attachDragListeners();
}

function attachStageListeners() {
  const questId = selectedQuestId;

  document.querySelectorAll(".stage-checkbox").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
      updateStage(questId, stageId, { is_done: e.target.checked ? 1 : 0 });
    });
  });

  document.querySelectorAll(".stage-name-input").forEach(input => {
    let debounce;
    input.addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
        updateStage(questId, stageId, { name: e.target.value });
      }, 500);
    });
  });

  document.querySelectorAll(".stage-broadcast-input").forEach(textarea => {
    let debounce;
    textarea.addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
        updateStage(questId, stageId, { broadcast_text: e.target.value });
      }, 500);
    });
  });

  document.querySelectorAll(".stage-delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
      deleteStage(questId, stageId);
    });
  });
}

// --- Drag and Drop ---
function attachDragListeners() {
  const rows = document.querySelectorAll(".stage-row");
  rows.forEach(row => {
    row.addEventListener("dragstart", handleDragStart);
    row.addEventListener("dragover", handleDragOver);
    row.addEventListener("dragend", handleDragEnd);
    row.addEventListener("drop", handleDrop);
  });
}

function handleDragStart(e) {
  dragState = { draggedId: parseInt(e.target.dataset.id) };
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const row = e.target.closest(".stage-row");
  if (row && parseInt(row.dataset.id) !== dragState.draggedId) {
    row.classList.add("drag-over");
  }
}

function handleDragEnd(e) {
  document.querySelectorAll(".stage-row").forEach(r => {
    r.classList.remove("dragging", "drag-over");
  });
  dragState = null;
}

function handleDrop(e) {
  e.preventDefault();
  const targetRow = e.target.closest(".stage-row");
  if (!targetRow || !dragState) return;

  const targetId = parseInt(targetRow.dataset.id);
  const draggedId = dragState.draggedId;
  if (targetId === draggedId) return;

  // Build new order
  const stageIds = selectedQuestStages.map(s => s.id);
  const fromIdx = stageIds.indexOf(draggedId);
  const toIdx = stageIds.indexOf(targetId);

  stageIds.splice(fromIdx, 1);
  stageIds.splice(toIdx, 0, draggedId);

  // Optimistic reorder
  selectedQuestStages = stageIds.map(id => selectedQuestStages.find(s => s.id === id));
  renderStages();

  // Persist
  reorderStages(selectedQuestId, stageIds);
}

// --- Event Listeners ---
function setupEventListeners() {
  document.getElementById("btn-new-quest").addEventListener("click", createQuest);

  document.getElementById("btn-add-stage").addEventListener("click", () => {
    if (selectedQuestId) addStage(selectedQuestId);
  });

  document.getElementById("quest-name").addEventListener("change", (e) => {
    if (selectedQuestId) updateQuest(selectedQuestId, { name: e.target.value });
  });

  document.getElementById("quest-description").addEventListener("change", (e) => {
    if (selectedQuestId) updateQuest(selectedQuestId, { description: e.target.value });
  });

  document.getElementById("quest-status").addEventListener("change", (e) => {
    if (selectedQuestId) updateQuest(selectedQuestId, { status: e.target.value });
  });

  document.getElementById("btn-delete-quest").addEventListener("click", () => {
    if (selectedQuestId) deleteQuest(selectedQuestId);
  });
}

function selectQuest(id) {
  selectedQuestId = id;
  renderQuestList();
  renderQuestDetail();
  loadStages(id);
}

// --- Helpers ---
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
