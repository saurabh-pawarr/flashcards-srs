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
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const $ = (id) => document.getElementById(id);

let user = null;
let cards = [];
let current = null;
let revealed = false;

// ---------- Time helpers ----------
function today0() { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function daysFromNow(days){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+days); return d.getTime(); }

// ---------- UI show/hide ----------
function setLoggedInUI(isIn) {
  $("loginCard").style.display = isIn ? "none" : "block";       // hide login after login ✅
  $("userbar").style.display = isIn ? "flex" : "none";
  $("addCard").style.display = isIn ? "block" : "none";
  $("studyCard").style.display = isIn ? "block" : "none";
  $("listCard").style.display = isIn ? "block" : "none";
}

function cardsCol(){ return collection(db, `users/${user.uid}/cards`); }

// ---------- Translation (FREE) ----------
/**
 * We do this:
 * 1) If user selected language != auto => use that
 * 2) Else try detect via LibreTranslate
 * 3) If detect fails => DEFAULT TO 'de' (German) so MyMemory NEVER breaks.
 */

async function detectLangLibre(text){
  try{
    const r = await fetch("https://libretranslate.de/detect", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ q:text })
    });
    const data = await r.json();
    const lang = Array.isArray(data) && data[0]?.language ? data[0].language : null;
    if (lang && /^[a-z]{2}$/i.test(lang)) return lang.toLowerCase();
  }catch{}
  return null;
}

function germanHeuristic(text){
  // quick fallback if detect fails: if it contains German chars or common words
  const t = text.toLowerCase();
  if (/[äöüß]/.test(t)) return true;
  if (/\b(der|die|das|und|nicht|ich|du|ein|eine|ist|war|bin|zu|mit|für)\b/.test(t)) return true;
  return false;
}

async function translateToEnglish(text, sourceChoice){
  let from = sourceChoice;
  if (from === "auto") {
    from = await detectLangLibre(text);
    if (!from) from = germanHeuristic(text) ? "de" : "en";  // ✅ never "auto"
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|en`;
  const r = await fetch(url);
  const data = await r.json();
  const en = data?.responseData?.translatedText || "";

  // if MyMemory returns an error message as "translation", guard it
  if (/invalid source language/i.test(en)) {
    // hard fallback to German
    const url2 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=de|en`;
    const r2 = await fetch(url2);
    const d2 = await r2.json();
    return { from:"de", en: d2?.responseData?.translatedText || "" };
  }

  return { from, en };
}

async function fetchExamples(text, fromLang){
  // Best-effort only; examples may be empty.
  try{
    const map = { de:"deu", en:"eng", fr:"fra", es:"spa", it:"ita", hi:"hin" };
    const from = map[fromLang] || "deu";
    const url = `https://tatoeba.org/en/api_v0/search?from=${from}&to=eng&query=${encodeURIComponent(text)}&sort=relevance`;
    const r = await fetch(url);
    const data = await r.json();
    const results = data?.results || [];
    return results.slice(0,4).map(x => ({
      src: x.text,
      en: x.translations?.[0]?.[0]?.text || ""
    })).filter(x => x.src && x.en);
  }catch{
    return [];
  }
}

// ---------- CRUD ----------
async function loadCards(){
  if(!user) return;
  // order by createdAt for stable list
  const qy = query(cardsCol(), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);
  cards = snap.docs.map(d => ({ id:d.id, ...d.data() }));
  // normalize dueAt
  const now = today0();
  for (const c of cards) if (!c.dueAt) c.dueAt = now;
}

function dueCards(){
  const now = today0();
  return cards.filter(c => (c.dueAt ?? now) <= now);
}

function pickNext(){
  const due = dueCards().sort((a,b)=> (a.dueAt||0)-(b.dueAt||0));
  return due[0] || null;
}

function renderStats(){
  $("stats").textContent = `Due: ${dueCards().length} • Total: ${cards.length}`;
}

function renderList(){
  const q = ($("search").value || "").toLowerCase().trim();
  const el = $("list");
  el.innerHTML = "";

  const filtered = cards.filter(c => {
    if(!q) return true;
    return `${c.phrase||""} ${c.en||""}`.toLowerCase().includes(q);
  });

  if(filtered.length === 0){
    el.innerHTML = `<div class="muted">No cards.</div>`;
    return;
  }

  for(const c of filtered){
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(c.phrase || "")}</div>
          <div class="itemMeta">${escapeHtml(c.en || "")}</div>
        </div>
        <button class="btn danger" data-del="${c.id}">Delete</button>
      </div>
    `;
    el.appendChild(div);
  }
}

function showCard(card){
  current = card;
  revealed = false;
  $("backArea").style.display = "none";

  if(!card){
    $("chipState").textContent = "DONE";
    $("frontText").textContent = "No cards due ✅";
    $("frontMeta").textContent = "Add more words above or come back later.";
    $("backText").textContent = "—";
    $("backExamples").textContent = "";
    return;
  }

  $("chipState").textContent = "DUE";
  $("frontText").textContent = card.phrase || "—";
  $("frontMeta").textContent = `Detected: ${card.lang || "?"} • Due: ${new Date(card.dueAt).toLocaleDateString()}`;
  $("backText").textContent = card.en || "—";

  const ex = Array.isArray(card.examples) ? card.examples : [];
  $("backExamples").textContent = ex.length
    ? "Examples: " + ex.map(e => `${e.src} → ${e.en}`).join(" | ")
    : "Examples: (none found)";
}

async function refreshAll(){
  await loadCards();
  renderStats();
  renderList();
  showCard(pickNext());
}

// ---------- Auth ----------
$("btnLogin").onclick = async () => {
  $("loginStatus").textContent = "";
  try{
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  }catch(e){
    $("loginStatus").textContent = "Login failed: " + (e?.message || e);
  }
};

$("btnLogout").onclick = async () => {
  await signOut(auth);
};

onAuthStateChanged(auth, async (u) => {
  user = u;
  if(!user){
    setLoggedInUI(false);
    $("loginStatus").textContent = "Logged out.";
    return;
  }
  setLoggedInUI(true);
  $("userEmail").textContent = user.email || "Logged in";
  await refreshAll();
});

// ---------- Add / Translate ----------
$("btnClear").onclick = () => {
  $("phrase").value = "";
  $("preview").style.display = "none";
  $("addStatus").textContent = "";
};

$("btnTranslate").onclick = async () => {
  const text = $("phrase").value.trim();
  if(!text) return;

  $("addStatus").textContent = "Translating…";
  $("preview").style.display = "none";

  try{
    const sourceChoice = $("sourceLang").value;
    const { from, en } = await translateToEnglish(text, sourceChoice);
    const examples = await fetchExamples(text, from);

    // preview
    $("preview").style.display = "block";
    $("pLang").textContent = from;
    $("pEn").textContent = en;
    $("pExamples").innerHTML = examples.length
      ? examples.map(x => `<li>${escapeHtml(x.src)} → ${escapeHtml(x.en)}</li>`).join("")
      : "<li>(No examples found)</li>";

    // save
    await addDoc(cardsCol(), {
      phrase: text,
      lang: from,
      en,
      examples,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      dueAt: today0(),        // due now
      // progress fields
      lastGrade: null
    });

    $("addStatus").textContent = "Saved ✅";
    $("phrase").value = "";
    await refreshAll();
  }catch(e){
    $("addStatus").textContent = "Error: " + (e?.message || e);
  }
};

// ---------- Study controls ----------
$("btnReveal").onclick = () => {
  if(!current) return;
  revealed = true;
  $("backArea").style.display = "block";
};

async function gradeCurrent(days, label){
  if(!current) return;

  const dueAt = daysFromNow(days);
  const ref = doc(db, `users/${user.uid}/cards/${current.id}`);
  await updateDoc(ref, {
    dueAt,
    lastGrade: label,
    updatedAt: serverTimestamp()
  });

  await refreshAll();
}

$("btnAgain").onclick = () => gradeCurrent(0, "again");   // today
$("btnHard").onclick  = () => gradeCurrent(1, "hard");    // 1 day
$("btnGood").onclick  = () => gradeCurrent(7, "good");    // 1 week
$("btnEasy").onclick  = () => gradeCurrent(30,"easy");    // 1 month

$("btnDelete").onclick = async () => {
  if(!current) return;
  if(!confirm("Delete this card permanently?")) return;
  const ref = doc(db, `users/${user.uid}/cards/${current.id}`);
  await deleteDoc(ref);
  await refreshAll();
};

// list delete
$("list").addEventListener("click", async (e) => {
  const id = e.target?.dataset?.del;
  if(!id) return;
  if(!confirm("Delete this card permanently?")) return;
  await deleteDoc(doc(db, `users/${user.uid}/cards/${id}`));
  await refreshAll();
});

$("search").addEventListener("input", renderList);

// ---------- Tinder swipe (only after reveal) ----------
const swipeEl = $("swipeCard");
let startX = 0, curX = 0, dragging = false;

swipeEl.addEventListener("pointerdown", (e) => {
  if(!current || !revealed) return;
  dragging = true;
  startX = e.clientX;
  swipeEl.setPointerCapture(e.pointerId);
});

swipeEl.addEventListener("pointermove", (e) => {
  if(!dragging) return;
  curX = e.clientX - startX;
  swipeEl.style.transform = `translateX(${curX}px) rotate(${curX/18}deg)`;
});

swipeEl.addEventListener("pointerup", async () => {
  if(!dragging) return;
  dragging = false;
  const x = curX;
  curX = 0;

  if (x < -120) {
    swipeEl.style.transform = "translateX(-420px) rotate(-12deg)";
    setTimeout(()=> swipeEl.style.transform = "", 120);
    await gradeCurrent(0, "again"); // left = again
  } else if (x > 120) {
    swipeEl.style.transform = "translateX(420px) rotate(12deg)";
    setTimeout(()=> swipeEl.style.transform = "", 120);
    await gradeCurrent(30, "easy"); // right = easy
  } else {
    swipeEl.style.transform = "";
  }
});

// ---------- helpers ----------
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}
