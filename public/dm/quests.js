// --- State ---
var quests = [];
var selectedQuestId = null;
var selectedQuestStages = [];
var allPlayers = [];
var currentTheme = "pipboy";

var socket = io();

// --- Init ---
document.addEventListener("DOMContentLoaded", function() {
  loadQuests();
  loadPlayers();
  setupEventListeners();

  // Newspaper masthead date (noir theme)
  var dateEl = document.querySelector(".masthead-date");
  if (dateEl) {
    var dateStr = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    dateEl.textContent = dateStr + " — EDIÇÃO DA MANHÃ";
  }

  // Load theme
  fetch("/api/config/theme")
    .then(function(r) { return r.json(); })
    .then(function(data) {
      currentTheme = data.theme;
      document.body.className = "theme-" + currentTheme;
      var sel = document.getElementById("theme-select");
      if (sel) sel.value = currentTheme;
    });

  socket.on("theme:changed", function(data) {
    currentTheme = data.theme;
    document.body.className = "theme-" + currentTheme;
    var sel = document.getElementById("theme-select");
    if (sel) sel.value = currentTheme;
  });
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

// --- Player Messages ---
function loadPlayers() {
  return api("GET", "/players").then(function(data) {
    allPlayers = data;
  });
}

function loadStageMessages(stageId) {
  if (!selectedQuestId) return Promise.resolve([]);
  return api("GET", "/quests/" + selectedQuestId + "/stages/" + stageId + "/messages");
}

function upsertStageMessage(questId, stageId, playerId, messageText) {
  return api("PUT", "/quests/" + questId + "/stages/" + stageId + "/messages", {
    player_id: playerId,
    message_text: messageText,
  });
}

function deleteStageMessage(questId, stageId, messageId) {
  return api("DELETE", "/quests/" + questId + "/stages/" + stageId + "/messages/" + messageId);
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

  var stageMessagePromises = selectedQuestStages.map(function(stage) {
    return loadStageMessages(stage.id).then(function(msgs) {
      return { stageId: stage.id, messages: msgs };
    });
  });

  Promise.all(stageMessagePromises).then(function(results) {
    var messagesByStage = {};
    results.forEach(function(r) {
      messagesByStage[r.stageId] = r.messages;
    });

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

      var playerMsgs = messagesByStage[stage.id] || [];
      var configuredPlayers = playerMsgs.map(function(pm) {
        var player = allPlayers.find(function(p) { return p.id === pm.player_id; });
        var name = player ? escapeHtml(player.display_name) : pm.player_id;
        return '<span class="player-msg-badge" data-stage-id="' + stage.id + '" data-player-id="' + pm.player_id + '" data-message-id="' + pm.id + '">' + name + ' <span class="badge-remove">&times;</span></span>';
      }).join("");

      var playerOptions = allPlayers.map(function(p) {
        return '<option value="' + p.id + '">' + escapeHtml(p.display_name) + '</option>';
      }).join("");

      return '<div class="stage-row ' + doneClass + '" data-id="' + stage.id + '">' +
        '<button class="stage-end-btn' + endedClass + '" title="' + endTitle + '">' + endLabel + '</button>' +
        '<input type="text" class="stage-name-input" value="' + escapeHtml(stage.name) + '" placeholder="Nome do estagio">' +
        '<div class="stage-broadcast">' +
        '<textarea class="stage-broadcast-input" placeholder="Texto do broadcast (fallback)">' + escapeHtml(stage.broadcast_text || "") + '</textarea>' +
        broadcastPreview +
        '</div>' +
        '<button class="stage-delete-btn" title="Excluir estagio"><i class="fas fa-times"></i></button>' +
        '<div class="stage-player-messages">' +
        '<div class="player-msg-row">' +
        '<select class="player-select"><option value="">Selecionar jogador...</option>' + playerOptions + '</select>' +
        '<textarea class="player-msg-input" placeholder="Mensagem para este jogador" disabled></textarea>' +
        '</div>' +
        '<div class="player-msg-badges">' + configuredPlayers + '</div>' +
        '</div>' +
        '</div>';
    }).join("");

    attachStageListeners();
  });
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

  // Player select + message input
  document.querySelectorAll(".player-select").forEach(function(select) {
    select.addEventListener("change", function(e) {
      var stageRow = e.target.closest(".stage-row");
      var stageId = parseInt(stageRow.dataset.id);
      var msgInput = stageRow.querySelector(".player-msg-input");
      var playerId = e.target.value;

      if (!playerId) {
        msgInput.value = "";
        msgInput.disabled = true;
        return;
      }

      msgInput.disabled = false;

      loadStageMessages(stageId).then(function(msgs) {
        var existing = msgs.find(function(m) { return m.player_id === playerId; });
        msgInput.value = existing ? existing.message_text : "";
      });
    });
  });

  document.querySelectorAll(".player-msg-input").forEach(function(textarea) {
    var debounce;
    textarea.addEventListener("input", function(e) {
      clearTimeout(debounce);
      debounce = setTimeout(function() {
        var stageRow = e.target.closest(".stage-row");
        var stageId = parseInt(stageRow.dataset.id);
        var select = stageRow.querySelector(".player-select");
        var playerId = select.value;
        if (!playerId) return;

        upsertStageMessage(questId, stageId, playerId, e.target.value).then(function() {
          renderStages();
        });
      }, 500);
    });
  });

  // Badge click to edit
  document.querySelectorAll(".player-msg-badge").forEach(function(badge) {
    badge.addEventListener("click", function(e) {
      if (e.target.classList.contains("badge-remove")) return;
      var stageRow = badge.closest(".stage-row");
      var select = stageRow.querySelector(".player-select");
      var msgInput = stageRow.querySelector(".player-msg-input");
      select.value = badge.dataset.playerId;
      msgInput.disabled = false;
      loadStageMessages(parseInt(stageRow.dataset.id)).then(function(msgs) {
        var existing = msgs.find(function(m) { return m.player_id === badge.dataset.playerId; });
        msgInput.value = existing ? existing.message_text : "";
      });
    });
  });

  // Badge remove button
  document.querySelectorAll(".badge-remove").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      var badge = e.target.closest(".player-msg-badge");
      var stageId = badge.dataset.stageId;
      var messageId = badge.dataset.messageId;
      deleteStageMessage(questId, stageId, messageId).then(function() {
        renderStages();
      });
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

  var themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    themeSelect.addEventListener("change", function(e) {
      fetch("/api/config/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: e.target.value })
      });
    });
  }
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
