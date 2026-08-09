// --- State ---
var quests = [];
var selectedQuestId = null;
var selectedQuestStages = [];

// --- Init ---
document.addEventListener("DOMContentLoaded", function() {
  loadQuests();
  setupEventListeners();
});

// --- API helpers ---
function api(method, path, body) {
  var opts = {
    method: method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch("/api" + path, opts).then(function(res) {
    if (!res.ok) {
      return res.json().catch(function() { return { error: "Request failed" }; }).then(function(err) {
        throw new Error(err.error);
      });
    }
    return res.json();
  });
}

// --- Quest CRUD ---
function loadQuests() {
  return api("GET", "/quests").then(function(data) {
    quests = data;
    renderQuestList();
  });
}

function createQuest() {
  var name = prompt("Nome da missao:");
  if (!name) return;
  return api("POST", "/quests", { name: name }).then(function(quest) {
    quests.push(quest);
    renderQuestList();
    selectQuest(quest.id);
  });
}

function updateQuest(id, data) {
  return api("PUT", "/quests/" + id, data).then(function(updated) {
    var idx = quests.findIndex(function(q) { return q.id === id; });
    if (idx !== -1) quests[idx] = updated;
    if ("status" in data) {
      renderQuestList();
    }
    return updated;
  });
}

function deleteQuest(id) {
  if (!confirm("Tem certeza que deseja excluir esta missao?")) return;
  return api("DELETE", "/quests/" + id).then(function() {
    quests = quests.filter(function(q) { return q.id !== id; });
    selectedQuestId = null;
    renderQuestList();
    renderQuestDetail();
  });
}

// --- Stage CRUD ---
function loadStages(questId) {
  return api("GET", "/quests/" + questId + "/stages").then(function(data) {
    selectedQuestStages = data;
    renderStages();
  });
}

function addStage(questId) {
  return api("POST", "/quests/" + questId + "/stages", { name: "Novo estagio" }).then(function(stage) {
    selectedQuestStages.push(stage);
    renderStages();
    var nameInputs = document.querySelectorAll(".stage-name-input");
    if (nameInputs.length) nameInputs[nameInputs.length - 1].focus();
  });
}

function updateStage(questId, stageId, data) {
  return api("PUT", "/quests/" + questId + "/stages/" + stageId, data).then(function(updated) {
    var idx = selectedQuestStages.findIndex(function(s) { return s.id === stageId; });
    if (idx !== -1) selectedQuestStages[idx] = updated;
    if ("is_done" in data) {
      renderStages();
      renderQuestList();
    }
    return updated;
  });
}

function deleteStage(questId, stageId) {
  if (!confirm("Excluir este estagio?")) return;
  return api("DELETE", "/quests/" + questId + "/stages/" + stageId).then(function() {
    selectedQuestStages = selectedQuestStages.filter(function(s) { return s.id !== stageId; });
    renderStages();
  });
}

// --- Rendering ---
function renderQuestList() {
  var container = document.getElementById("quest-list");
  if (!quests.length) {
    container.innerHTML = '<p class="empty-text">Nenhuma missao ainda.</p>';
    return;
  }

  container.innerHTML = quests.map(function(q) {
    var statusIcon = q.status === "active" ? "\u25cf"
      : q.status === "completed" ? "\u2713" : "\u2717";
    var statusClass = q.status === "completed" ? "completed"
      : q.status === "failed" ? "failed" : "";
    var activeClass = q.id === selectedQuestId ? "active" : "";

    return '<div class="quest-item ' + activeClass + '" data-id="' + q.id + '">' +
      '<span class="quest-status ' + statusClass + '">' + statusIcon + '</span>' +
      '<span class="quest-name">' + escapeHtml(q.name) + '</span>' +
      '</div>';
  }).join("");

  container.querySelectorAll(".quest-item").forEach(function(el) {
    el.addEventListener("click", function() { selectQuest(parseInt(el.dataset.id)); });
  });
}

function renderQuestDetail() {
  var detail = document.getElementById("quest-detail");
  var empty = document.getElementById("quest-empty");

  if (!selectedQuestId) {
    detail.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  detail.classList.remove("hidden");
  empty.classList.add("hidden");

  var quest = quests.find(function(q) { return q.id === selectedQuestId; });
  if (!quest) return;

  document.getElementById("quest-name").value = quest.name;
  document.getElementById("quest-description").value = quest.description || "";
  document.getElementById("quest-status").value = quest.status;
}

function renderStages() {
  var container = document.getElementById("stages-list");

  if (!selectedQuestStages.length) {
    container.innerHTML = '<p class="empty-text">Nenhum estagio. Adicione um!</p>';
    return;
  }

  container.innerHTML = selectedQuestStages.map(function(stage) {
    var doneClass = stage.is_done ? "done" : "";
    var broadcastPreview;
    if (stage.broadcast_text) {
      var text = escapeHtml(stage.broadcast_text.substring(0, 40));
      if (stage.broadcast_text.length > 40) text += "...";
      broadcastPreview = '<span class="broadcast-preview">' + text + '</span>';
    } else {
      broadcastPreview = '<span class="broadcast-preview none">(nenhum)</span>';
    }

    var endLabel = stage.is_done ? "DONE" : "END";
    var endTitle = stage.is_done ? "Desfazer" : "Finalizar estagio";
    var endedClass = stage.is_done ? " ended" : "";

    return '<div class="stage-row ' + doneClass + '" data-id="' + stage.id + '">' +
      '<button class="stage-end-btn' + endedClass + '" title="' + endTitle + '">' + endLabel + '</button>' +
      '<input type="text" class="stage-name-input" value="' + escapeHtml(stage.name) + '" placeholder="Nome do estagio">' +
      '<div class="stage-broadcast">' +
      '<textarea class="stage-broadcast-input" placeholder="Texto do broadcast (opcional)">' + escapeHtml(stage.broadcast_text || "") + '</textarea>' +
      broadcastPreview +
      '</div>' +
      '<button class="stage-delete-btn" title="Excluir estagio"><i class="fas fa-times"></i></button>' +
      '</div>';
  }).join("");

  attachStageListeners();
}

function attachStageListeners() {
  var questId = selectedQuestId;

  document.querySelectorAll(".stage-end-btn").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      var stageId = parseInt(e.target.closest(".stage-row").dataset.id);
      var stage = selectedQuestStages.find(function(s) { return s.id === stageId; });
      var newDone = stage && stage.is_done ? 0 : 1;
      updateStage(questId, stageId, { is_done: newDone });
    });
  });

  document.querySelectorAll(".stage-name-input").forEach(function(input) {
    var debounce;
    input.addEventListener("input", function(e) {
      clearTimeout(debounce);
      debounce = setTimeout(function() {
        var stageId = parseInt(e.target.closest(".stage-row").dataset.id);
        updateStage(questId, stageId, { name: e.target.value });
      }, 500);
    });
  });

  document.querySelectorAll(".stage-broadcast-input").forEach(function(textarea) {
    var debounce;
    textarea.addEventListener("input", function(e) {
      clearTimeout(debounce);
      debounce = setTimeout(function() {
        var stageId = parseInt(e.target.closest(".stage-row").dataset.id);
        updateStage(questId, stageId, { broadcast_text: e.target.value });
      }, 500);
    });
    textarea.addEventListener("blur", function(e) {
      var container = e.target.closest(".stage-broadcast");
      var preview = container.querySelector(".broadcast-preview");
      e.target.classList.remove("visible");
      preview.classList.remove("hidden");
    });
  });

  document.querySelectorAll(".broadcast-preview").forEach(function(preview) {
    preview.addEventListener("click", function(e) {
      var container = e.target.closest(".stage-broadcast");
      var textarea = container.querySelector(".stage-broadcast-input");
      preview.classList.add("hidden");
      textarea.classList.add("visible");
      textarea.focus();
    });
  });

  document.querySelectorAll(".stage-delete-btn").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      var stageId = parseInt(e.target.closest(".stage-row").dataset.id);
      deleteStage(questId, stageId);
    });
  });
}

// --- Event Listeners ---
function setupEventListeners() {
  document.getElementById("btn-new-quest").addEventListener("click", createQuest);

  document.getElementById("btn-add-stage").addEventListener("click", function() {
    if (selectedQuestId) addStage(selectedQuestId);
  });

  document.getElementById("quest-name").addEventListener("change", function(e) {
    if (selectedQuestId) updateQuest(selectedQuestId, { name: e.target.value });
  });

  document.getElementById("quest-description").addEventListener("change", function(e) {
    if (selectedQuestId) updateQuest(selectedQuestId, { description: e.target.value });
  });

  document.getElementById("quest-status").addEventListener("change", function(e) {
    if (selectedQuestId) updateQuest(selectedQuestId, { status: e.target.value });
  });

  document.getElementById("btn-delete-quest").addEventListener("click", function() {
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
  var div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
