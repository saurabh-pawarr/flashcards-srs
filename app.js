// --- Firebase (CDN modules) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your config (public; protected by Auth + Firestore Rules)
const firebaseConfig = {
  apiKey: "AIzaSyD5jk9FcywvGBNRLGlSHeLFnbTXcOBYDCc",
  authDomain: "flashcards-srs.firebaseapp.com",
  projectId: "flashcards-srs",
  storageBucket: "flashcards-srs.firebasestorage.app",
  messagingSenderId: "335428443475",
  appId: "1:335428443475:web:fdbbdfbf5e9e6bb45cd5a6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UI helpers ---
const $ = (id) => document.getElementById(id);
const loginCard = $("loginCard");
const addCard = $("addCard");
const studyCard = $("studyCard");

let user = null;
let cards = [];      // loaded from Firestore
let current = null;  // current card object
let revealed = false;

// --- SRS helpers (simple + effective) ---
function today0() {
  const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
}
function daysFromNow(days) {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+days); return d.getTime();
}
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

// grade: 0 Again, 5 Easy
function applySRS(card, grade) {
  let ease = card.ease ?? 2.5;
  let reps = card.reps ?? 0;
  let interval = card.intervalDays ?? 0;
  let lapses = card.lapses ?? 0;

  // SM-2-ish ease update
  const q = clamp(grade, 0, 5);
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = clamp(ease, 1.3, 2.7);

  if (q < 3) {
    // fail
    lapses += 1;
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 2;
    else if (reps === 2) interval = 4;
    else interval = Math.round(Math.max(1, interval * ease * 1.1));
  }

  return {
    ease,
    reps,
    intervalDays: interval,
    dueAt: daysFromNow(interval),
    lapses
  };
}

// --- Translation (FREE) ---
// We’ll do: detect language (LibreTranslate public instance) -> translate to English (MyMemory as fallback)
// Note: public free services can rate-limit sometimes; for personal use usually ok.

async function detectLang(text) {
  // LibreTranslate public instance (can change; if it fails, we return "auto")
  try {
    const r = await fetch("https://libretranslate.de/detect", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ q: text })
    });
    const data = await r.json();
    if (Array.isArray(data) && data[0]?.language) return data[0].language; // e.g. "de"
  } catch {}
  return "auto";
}

async function translateToEnglish(text, sourceLang) {
  // MyMemory needs langpair; if sourceLang unknown, try "auto" by guessing with detectLang
  const from = sourceLang && sourceLang !== "auto" ? sourceLang : await detectLang(text);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|en`;
  const r = await fetch(url);
  const data = await r.json();
  const en = data?.responseData?.translatedText || "";
  return { from, en };
}

async function fetchExamples(text, fromLang) {
  // Try Tatoeba API v0 (may not always return results)
  // We'll keep it best-effort; if it fails, return empty.
  try {
    // Tatoeba uses ISO 639-3 codes; many languages differ. We'll map common ones.
    const map = { de:"deu", en:"eng", fr:"fra", es:"spa", it:"ita", hi:"hin" };
    const from = map[fromLang] || "deu";
    const url = `https://tatoeba.org/en/api_v0/search?from=${from}&to=eng&query=${encodeURIComponent(text)}&sort=relevance`;
    const r = await fetch(url);
    const data = await r.json();
    const results = data?.results || [];
    const examples = results.slice(0,4).map(x => ({
      src: x.text,
      en: x.translations?.[0]?.[0]?.text || ""
    })).filter(x => x.src && x.en);
    return examples;
  } catch {
    return [];
  }
}

// --- Firestore paths ---
function cardsCol() {
  return collection(db, `users/${user.uid}/cards`);
}

// --- Load all cards (simple: personal use, no indexing headaches) ---
async function loadCards() {
  if (!user) return;
  const snap = await getDocs(cardsCol());
  cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ensure dueAt exists
  const now = today0();
  for (const c of cards) {
    if (!c.dueAt) c.dueAt = now;
  }
}

// --- Pick next due card ---
function dueCards() {
  const now = today0();
  return cards.filter(c => (c.dueAt ?? now) <= now);
}
function pickNext() {
  const due = dueCards().sort((a,b)=> (a.dueAt||0)-(b.dueAt||0));
  return due[0] || null;
}

// --- Render study card ---
function renderStats() {
  const due = dueCards().length;
  $("stats").textContent = `Due: ${due} • Total: ${cards.length}`;
}

function showCard(card) {
  current = card;
  revealed = false;
  $("backArea").style.display = "none";
  $("btnReveal").disabled = !card;

  if (!card) {
    $("frontText").textContent = "No cards due right now ✅";
    $("frontMeta").textContent = "Add more phrases or come back tomorrow.";
    $("backText").textContent = "—";
    $("backExamples").textContent = "";
    return;
  }

  $("frontText").textContent = card.phrase || "—";
  $("frontMeta").textContent = `Detected: ${card.lang || "?"} • Due: ${new Date(card.dueAt).toLocaleDateString()}`;
  $("backText").textContent = card.en || "—";

  const ex = Array.isArray(card.examples) ? card.examples : [];
  $("backExamples").textContent = ex.length
    ? "Examples: " + ex.map(e => `${e.src} → ${e.en}`).join(" | ")
    : "Examples: (none found)";
}

async function refreshStudy() {
  await loadCards();
  renderStats();
  showCard(pickNext());
}

// --- Login handlers ---
$("btnLogin").onclick = async () => {
  $("loginStatus").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (e) {
    $("loginStatus").textContent = "Login failed: " + (e?.message || e);
  }
};

$("btnLogout").onclick = async () => {
  await signOut(auth);
};

// auth state
onAuthStateChanged(auth, async (u) => {
  user = u;
  if (!user) {
    addCard.style.display = "none";
    studyCard.style.display = "none";
    $("btnLogout").style.display = "none";
    $("loginStatus").textContent = "Logged out.";
    return;
  }

  $("loginStatus").textContent = `Logged in as ${user.email}`;
  $("btnLogout").style.display = "inline-block";
  addCard.style.display = "block";
  studyCard.style.display = "block";
  await refreshStudy();
});

// --- Add phrase -> translate -> examples -> save ---
$("btnTranslate").onclick = async () => {
  const text = $("phrase").value.trim();
  if (!text) return;

  $("addStatus").textContent = "Translating…";
  $("preview").style.display = "none";

  try {
    const { from, en } = await translateToEnglish(text, "auto");
    const examples = await fetchExamples(text, from);

    // show preview
    $("preview").style.display = "block";
    $("pLang").textContent = from;
    $("pEn").textContent = en;
    $("pExamples").innerHTML = examples.length
      ? examples.map(x => `<li>${escapeHtml(x.src)} → ${escapeHtml(x.en)}</li>`).join("")
      : "<li>(No examples found)</li>";

    // save to Firestore (with initial SRS)
    const docData = {
      phrase: text,
      lang: from,
      en,
      examples,
      createdAt: serverTimestamp(),
      // SRS fields
      dueAt: today0(),
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0
    };

    await addDoc(cardsCol(), docData);

    $("addStatus").textContent = "Saved ✅";
    $("phrase").value = "";
    await refreshStudy();
  } catch (e) {
    $("addStatus").textContent = "Error: " + (e?.message || e);
  }
};

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

// --- Reveal + grade buttons ---
$("btnReveal").onclick = () => {
  if (!current) return;
  revealed = true;
  $("backArea").style.display = "block";
};

async function gradeCurrent(grade) {
  if (!current) return;
  const nextSrs = applySRS(current, grade);

  const ref = doc(db, `users/${user.uid}/cards/${current.id}`);
  await updateDoc(ref, { ...nextSrs, updatedAt: serverTimestamp() });

  await refreshStudy();
}

$("btnAgain").onclick = () => gradeCurrent(0);
$("btnEasy").onclick = () => gradeCurrent(5);

// --- Tinder swipe (left/right) ---
const swipeEl = $("swipeCard");
let startX = 0, curX = 0, dragging = false;

swipeEl.addEventListener("pointerdown", (e) => {
  if (!current || !revealed) return; // require reveal first
  dragging = true;
  startX = e.clientX;
  swipeEl.setPointerCapture(e.pointerId);
});

swipeEl.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  curX = e.clientX - startX;
  swipeEl.style.transform = `translateX(${curX}px) rotate(${curX/18}deg)`;
});

swipeEl.addEventListener("pointerup", async () => {
  if (!dragging) return;
  dragging = false;

  const x = curX;
  curX = 0;

  // threshold
  if (x < -120) {
    swipeEl.style.transform = "translateX(-420px) rotate(-12deg)";
    setTimeout(()=> swipeEl.style.transform = "", 120);
    await gradeCurrent(0); // Again
  } else if (x > 120) {
    swipeEl.style.transform = "translateX(420px) rotate(12deg)";
    setTimeout(()=> swipeEl.style.transform = "", 120);
    await gradeCurrent(5); // Easy
  } else {
    swipeEl.style.transform = "";
  }
});
