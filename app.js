// Flashcards SRS (SM-2 inspired) - all local, no backend
const STORAGE_KEY = "srs_flashcards_v1";

const $ = (sel) => document.querySelector(sel);

function todayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
}
function nowISO() {
  return new Date().toISOString();
}
function daysFromNow(days) {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/**
 * Card model:
 * {
 *  id, front, back, example, tags:[],
 *  createdAt, updatedAt,
 *  dueAt, intervalDays, ease, reps, lapses,
 *  state: "new"|"learning"|"review"
 * }
 */

// ------- Data -------
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { cards: [] };
  try { return JSON.parse(raw); }
  catch { return { cards: [] }; }
}
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadState();

// ------- Tabs -------
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    $(`#tab-${tab}`).classList.add("active");
    renderAll();
  });
});

// ------- Add form -------
$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const front = $("#in-front").value.trim();
  const back = $("#in-back").value.trim();
  const example = $("#in-example").value.trim();
  const tags = $("#in-tags").value.split(",").map(t => t.trim()).filter(Boolean);

  if (!front || !back) return;

  const card = {
    id: uid(),
    front, back,
    example: example || "",
    tags,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    // SRS fields
    dueAt: todayISO(),      // due immediately
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    state: "new"
  };

  state.cards.unshift(card);
  saveState(state);

  $("#add-form").reset();
  // Switch to Study tab
  document.querySelector('[data-tab="study"]').click();
});

// sample set
$("#btn-add-sample").addEventListener("click", () => {
  const samples = [
    ["der Bahnhof","train station","Ich bin am Bahnhof.","A1,travel,noun"],
    ["laufen","to run / walk","Ich laufe nach Hause.","A1,verb"],
    ["eigentlich","actually / really","Eigentlich habe ich keine Zeit.","A2,adverb"],
    ["während","during / while","Während des Films war es ruhig.","B1,prep"]
  ];
  samples.forEach(([front,back,example,tags]) => {
    const card = {
      id: uid(),
      front, back,
      example: example || "",
      tags: tags.split(",").map(t=>t.trim()).filter(Boolean),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      dueAt: todayISO(),
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      state: "new"
    };
    state.cards.unshift(card);
  });
  saveState(state);
  document.querySelector('[data-tab="study"]').click();
});

// ------- Study logic -------
let currentId = null;
let reveal = false;

function isDue(card) {
  return new Date(card.dueAt).getTime() <= new Date(todayISO()).getTime();
}

function pickNextCard() {
  // due cards first; otherwise show a new card
  const due = state.cards.filter(isDue);
  if (due.length === 0) return null;

  // prioritize learning/new before review
  const rank = (c) => {
    const s = c.state === "new" ? 0 : (c.state === "learning" ? 1 : 2);
    return s;
  };
  due.sort((a,b) => rank(a) - rank(b) || new Date(a.dueAt) - new Date(b.dueAt));
  return due[0];
}

/**
 * Grade mapping:
 * 0 Again (fail)
 * 1 Hard (struggle)
 * 3 Good (ok)
 * 5 Easy (strong)
 *
 * SM-2-ish:
 * - If grade < 3: reps=0, interval=1 day, ease decreases
 * - If grade >=3: reps++, interval grows, ease updates
 */
function applyGrade(card, grade) {
  const g = grade;

  // Update ease (SM-2 formula)
  // EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
  // with q in [0..5]
  const q = clamp(g, 0, 5);
  let ef = card.ease ?? 2.5;
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ef = clamp(ef, 1.3, 2.7);

  let reps = card.reps ?? 0;
  let interval = card.intervalDays ?? 0;

  if (q < 3) {
    // failed recall
    card.lapses = (card.lapses ?? 0) + 1;
    reps = 0;
    interval = 1;               // tomorrow
    card.state = "learning";
  } else {
    // success
    reps += 1;
    if (card.state === "new") card.state = "learning";
    if (reps === 1) interval = (q === 3 ? 1 : 2);
    else if (reps === 2) interval = (q === 3 ? 3 : 4);
    else {
      // grow by ease; hard slows down
      const hardFactor = (q === 3) ? 0.9 : 1.15;
      interval = Math.round(Math.max(1, interval * ef * hardFactor));
    }

    // Once interval is big enough, treat as review/mature
    if (interval >= 7) card.state = "review";
  }

  card.ease = ef;
  card.reps = reps;
  card.intervalDays = interval;
  card.dueAt = daysFromNow(interval);
  card.updatedAt = nowISO();
}

function resetStudyUI() {
  reveal = false;
  $("#back-area").classList.add("hidden");
  $("#rate-area").classList.add("hidden");
  $("#btn-reveal").classList.remove("hidden");
}

$("#btn-reveal").addEventListener("click", () => {
  reveal = true;
  $("#back-area").classList.remove("hidden");
  $("#rate-area").classList.remove("hidden");
  $("#btn-reveal").classList.add("hidden");
});

$("#btn-skip").addEventListener("click", () => {
  if (!currentId) return;
  // push card to tomorrow lightly so it doesn't block you
  const card = state.cards.find(c => c.id === currentId);
  if (card) {
    card.dueAt = daysFromNow(1);
    card.updatedAt = nowISO();
    saveState(state);
  }
  showNext();
});

$("#rate-area").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-grade]");
  if (!btn) return;
  const grade = Number(btn.dataset.grade);
  const card = state.cards.find(c => c.id === currentId);
  if (!card) return;

  applyGrade(card, grade);
  saveState(state);
  showNext();
});

function showNext() {
  resetStudyUI();
  const next = pickNextCard();
  if (!next) {
    currentId = null;
    $("#study-meta").textContent = "No cards due now. Add more words or come back later.";
    $("#front-text").textContent = "—";
    $("#front-sub").textContent = "";
    $("#back-text").textContent = "—";
    $("#back-sub").textContent = "";
    renderStats();
    return;
  }

  currentId = next.id;
  $("#study-meta").textContent =
    `State: ${next.state} • Interval: ${next.intervalDays} day(s) • Ease: ${next.ease.toFixed(2)} • Due: ${new Date(next.dueAt).toLocaleDateString()}`;

  $("#front-text").textContent = next.front;
  $("#front-sub").textContent = next.tags?.length ? `Tags: ${next.tags.join(", ")}` : "";

  $("#back-text").textContent = next.back;
  $("#back-sub").textContent = next.example ? `Example: ${next.example}` : "";
  renderStats();
}

// ------- Deck list -------
function stateLabel(card) {
  if (card.state === "new") return "New";
  if (card.state === "learning") return "Learning";
  return card.intervalDays >= 21 ? "Mature" : "Review";
}
function matchesFilter(card, filter) {
  if (filter === "all") return true;
  if (filter === "due") return isDue(card);
  if (filter === "new") return card.state === "new";
  if (filter === "learning") return card.state === "learning";
  if (filter === "mature") return (card.state === "review" && card.intervalDays >= 21);
  return true;
}
function renderDeck() {
  const q = ($("#search").value || "").toLowerCase().trim();
  const filter = $("#filter").value;

  const list = $("#deck-list");
  list.innerHTML = "";

  const cards = state.cards
    .filter(c => matchesFilter(c, filter))
    .filter(c => {
      if (!q) return true;
      const hay = `${c.front} ${c.back} ${c.example || ""} ${(c.tags||[]).join(" ")}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b) => new Date(a.dueAt) - new Date(b.dueAt));

  if (cards.length === 0) {
    list.innerHTML = `<div class="muted">No cards match.</div>`;
    return;
  }

  cards.forEach(card => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-top">
        <div class="item-words">
          <div><strong>${escapeHtml(card.front)}</strong> → ${escapeHtml(card.back)}</div>
          <div class="muted small">
            Due: ${new Date(card.dueAt).toLocaleDateString()} • ${stateLabel(card)} • Interval ${card.intervalDays}d • Ease ${card.ease.toFixed(2)}
          </div>
        </div>
        <div class="item-actions">
          <button class="ghost" data-action="edit" data-id="${card.id}">Edit</button>
          <button class="danger" data-action="del" data-id="${card.id}">Delete</button>
        </div>
      </div>
      ${card.example ? `<hr class="sep"><div class="muted">${escapeHtml(card.example)}</div>` : ""}
      ${(card.tags && card.tags.length) ? `<div class="tags" style="margin-top:10px">${card.tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    `;
    list.appendChild(div);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

$("#deck-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const card = state.cards.find(c => c.id === id);
  if (!card) return;

  if (action === "del") {
    if (!confirm("Delete this card?")) return;
    state.cards = state.cards.filter(c => c.id !== id);
    saveState(state);
    renderAll();
  }

  if (action === "edit") {
    const newFront = prompt("German (front):", card.front);
    if (newFront === null) return;
    const newBack = prompt("English (back):", card.back);
    if (newBack === null) return;
    const newExample = prompt("Example (optional):", card.example || "");
    if (newExample === null) return;
    const newTags = prompt("Tags (comma-separated):", (card.tags || []).join(", "));
    if (newTags === null) return;

    card.front = newFront.trim();
    card.back = newBack.trim();
    card.example = (newExample || "").trim();
    card.tags = (newTags || "").split(",").map(t=>t.trim()).filter(Boolean);
    card.updatedAt = nowISO();
    saveState(state);
    renderAll();
  }
});

$("#search").addEventListener("input", renderDeck);
$("#filter").addEventListener("change", renderDeck);

// ------- Backup -------
$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `flashcards-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#in-import").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = JSON.parse(text);
    if (!imported || !Array.isArray(imported.cards)) throw new Error("Invalid file");
    // basic sanitize
    imported.cards = imported.cards.map(c => ({
      id: c.id || uid(),
      front: String(c.front || "").trim(),
      back: String(c.back || "").trim(),
      example: String(c.example || ""),
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      createdAt: c.createdAt || nowISO(),
      updatedAt: nowISO(),
      dueAt: c.dueAt || todayISO(),
      intervalDays: Number(c.intervalDays ?? 0),
      ease: Number(c.ease ?? 2.5),
      reps: Number(c.reps ?? 0),
      lapses: Number(c.lapses ?? 0),
      state: c.state || "new",
    })).filter(c => c.front && c.back);

    state = imported;
    saveState(state);
    alert("Import successful!");
    e.target.value = "";
    renderAll();
  } catch {
    alert("Import failed. Please select a valid exported JSON file.");
  }
});

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("This will delete all cards from this browser. Continue?")) return;
  state = { cards: [] };
  saveState(state);
  renderAll();
});

// ------- Stats & initial render -------
function renderStats() {
  const total = state.cards.length;
  const due = state.cards.filter(isDue).length;
  const newly = state.cards.filter(c => c.state === "new").length;
  $("#stat-total").textContent = total;
  $("#stat-due").textContent = due;
  $("#stat-new").textContent = newly;
}

function renderAll() {
  renderStats();
  renderDeck();
  // If we're on study tab, ensure there's something loaded
  const studyPanelActive = $("#tab-study").classList.contains("active");
  if (studyPanelActive) {
    // If current card is missing or not due, pick next
    const current = state.cards.find(c => c.id === currentId);
    if (!current || !isDue(current)) showNext();
  }
}

// first load
renderAll();
showNext();
