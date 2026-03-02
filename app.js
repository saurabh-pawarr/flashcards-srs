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

// ---------- Initialize Theme ----------
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    if ($("btnTheme")) $("btnTheme").textContent = "☀️";
  } else {
    document.body.classList.remove("dark-mode");
    if ($("btnTheme")) $("btnTheme").textContent = "🌙";
  }
}

// Set theme on page load
initTheme();

// Theme toggle button
if ($("btnTheme")) {
  $("btnTheme").onclick = () => {
    const isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    $("btnTheme").textContent = isDark ? "☀️" : "🌙";
  };
}

// Flashcard flip on click
if ($("flashcard")) {
  $("flashcard").addEventListener("click", function() {
    this.classList.toggle("flipped");
  });
}

// ---------- Time helpers ----------
function today0() { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function daysFromNow(days){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+days); return d.getTime(); }

// ---------- UI show/hide ----------
function setLoggedInUI(isIn) {
  $("loginPage").style.display = isIn ? "none" : "block";       // show login page
  $("appPage").style.display = isIn ? "block" : "none";         // show app page (everything)
  $("userbar").style.display = isIn ? "flex" : "none";
}

function cardsCol(){ return collection(db, `users/${user.uid}/cards`); }

// ---------- Translation with LINGUEE API (Real Translations) ----------
/**
 * Best free translation pipeline:
 * 1) Detect language
 * 2) Try Linguee (crowdsourced, very accurate)
 * 3) Try Reverso Context (real examples from web)
 * 4) Try MyMemory
 * 5) Validate quality before returning
 */

async function detectLang(text){
  try{
    const r = await fetch("https://libretranslate.de/detect", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ q:text })
    });
    const data = await r.json();
    const lang = Array.isArray(data) && data[0]?.language ? data[0].language : null;
    if (lang && /^[a-z]{2}$/i.test(lang)) return lang.toLowerCase();
  }catch(e){
    console.warn("Detect failed:", e);
  }
  return null;
}

function germanHeuristic(text){
  const t = text.toLowerCase();
  if (/[äöüß]/.test(t)) return true;
  if (/\b(der|die|das|und|nicht|ich|du|ein|eine|ist|war|bin|zu|mit|für|nach|über|durch|haben|sein|werden|schon|noch|mehr|aber|oder)\b/.test(t)) return true;
  return false;
}

// LibreTranslate - Completely free, open-source, no API key needed
// Public instance at libretranslate.de
async function translateLibreTranslate(text, fromLang) {
  try {
    const langMap = { 
      de: "de", en: "en", fr: "fr", es: "es", 
      it: "it", hi: "hi", pt: "pt", ja: "ja" 
    };
    const from = langMap[fromLang] || "de";
    
    // Multiple LibreTranslate instances to try
    const instances = [
      "https://libretranslate.de/translate",
      "https://translate.terraprint.com/translate",
      "https://libre.cakes.su/translate"
    ];
    
    for (const url of instances) {
      try {
        const r = await fetch(url, {
          method: "POST",
          body: JSON.stringify({
            q: text,
            source: from,
            target: "en"
          }),
          headers: { 
            "Content-Type": "application/json"
          }
        });
        
        if (!r.ok) continue;
        const data = await r.json();
        
        if (data?.translatedText && typeof data.translatedText === 'string') {
          const trans = data.translatedText.trim();
          if (trans && trans.length > 0 && trans.length < 300) {
            console.log(`LibreTranslate (${url}) succeeded`);
            return trans;
          }
        }
      } catch (e) {
        console.warn(`LibreTranslate instance failed (${url}):`, e);
        continue;
      }
    }
  } catch (e) {
    console.warn("LibreTranslate failed:", e);
  }
  return null;
}

// Reverso Context - Real examples from web
async function translateReverso(text, fromLang) {
  try {
    const url = `https://context.reverso.net/api/v1/translation/${fromLang}-en/${encodeURIComponent(text)}`;
    const r = await fetch(url);
    
    if (!r.ok) throw new Error("Reverso failed");
    const data = await r.json();
    
    if (data?.result?.translations && Array.isArray(data.result.translations) && data.result.translations.length > 0) {
      // Get first translation
      const trans = data.result.translations[0]?.text || data.result.translations[0];
      if (trans && typeof trans === 'string') {
        const cleaned = trans.trim();
        if (cleaned && cleaned.length > 0 && cleaned.length < 150) {
          return cleaned;
        }
      }
    }
  } catch (e) {
    console.warn("Reverso failed:", e);
  }
  return null;
}

// MyMemory - Reliable fallback
async function translateMyMemory(text, fromLang) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(fromLang)}|en`;
    const r = await fetch(url);
    const data = await r.json();
    
    const en = data?.responseData?.translatedText || "";
    if (en && en.trim().length > 0 && en.trim().length < 200 && !/invalid source language|not found|error/i.test(en)) {
      return en.trim();
    }
  } catch (e) {
    console.warn("MyMemory failed:", e);
  }
  return null;
}

async function translateToEnglish(text, sourceChoice){
  let from = sourceChoice;

  // Resolve language
  if (from === "auto") {
    from = await detectLang(text);
    if (!from) from = germanHeuristic(text) ? "de" : "en";
  }

  let en = null;
  
  // 1) Try LibreTranslate first (open-source, free, legitimate)
  console.log("Trying LibreTranslate for:", text);
  en = await translateLibreTranslate(text, from);
  if (en) {
    console.log("LibreTranslate result:", en);
    return { from, en };
  }

  // 2) Try Reverso Context (crowdsourced, legitimate)
  console.log("Trying Reverso for:", text);
  en = await translateReverso(text, from);
  if (en) {
    console.log("Reverso result:", en);
    return { from, en };
  }

  // 3) Fallback to MyMemory
  console.log("Trying MyMemory for:", text);
  en = await translateMyMemory(text, from);
  if (en) {
    console.log("MyMemory result:", en);
    return { from, en };
  }

  // 4) Try German fallback with MyMemory
  if (from !== "de") {
    console.log("Trying MyMemory (de fallback) for:", text);
    en = await translateMyMemory(text, "de");
    if (en) {
      console.log("MyMemory (de fallback) result:", en);
      return { from: "de", en };
    }
  }

  console.log("All translation services failed for:", text);
  return { from, en: "" };
}

async function fetchExamples(text, fromLang, limit = 5){
  try{
    const map = { de:"deu", en:"eng", fr:"fra", es:"spa", it:"ita", hi:"hin", pt:"por", ja:"jpn" };
    const from = map[fromLang] || "deu";
    const queryText = text.trim();

    // Try searching for sentences containing the phrase/word
    const url = `https://tatoeba.org/en/api_v0/search?from=${from}&to=eng&query=${encodeURIComponent(queryText)}&sort=relevance&limit=${limit + 2}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Tatoeba fetch failed");
    
    const data = await r.json();
    const results = data?.results || [];

    // Robustly extract translations - prefer sentences with both src and en
    const examples = [];
    for (const x of results) {
      const src = x?.text?.trim();
      
      // Try multiple paths to find English translation
      let en = null;
      if (x?.translations && Array.isArray(x.translations) && x.translations.length > 0) {
        const trans = x.translations[0];
        if (Array.isArray(trans) && trans.length > 0) {
          en = trans[0]?.text || trans[0]?.sentence?.text;
        } else if (typeof trans === 'object') {
          en = trans.text || trans.sentence?.text;
        }
      }

      if (src && en) {
        examples.push({ src, en: en.trim() });
        if (examples.length >= limit) break;
      }
    }

    // If we got some but not enough, try to get German-only sentences as fallback
    if (examples.length < 2 && results.length > 0) {
      for (const x of results) {
        if (!examples.some(e => e.src === x.text?.trim())) {
          const src = x?.text?.trim();
          if (src) {
            examples.push({ src, en: "(German example only)" });
            if (examples.length >= limit) break;
          }
        }
      }
    }

    return examples;
  } catch (e) {
    console.warn("Tatoeba fetch failed:", e);
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

// ---------- Multi-delete functionality ----------
function updateDeleteButtonState() {
  const checkboxes = document.querySelectorAll(".item-checkbox");
  const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  const btnDeleteSelected = $("btnDeleteSelected");
  
  if (btnDeleteSelected) {
    if (selectedCount > 0) {
      btnDeleteSelected.disabled = false;
      btnDeleteSelected.textContent = `Delete Selected (${selectedCount})`;
    } else {
      btnDeleteSelected.disabled = true;
      btnDeleteSelected.textContent = "Delete Selected";
    }
  }
}

function getSelectedIds() {
  const checkboxes = document.querySelectorAll(".item-checkbox:checked");
  return Array.from(checkboxes).map(cb => cb.dataset.id);
}

// ---------- A1 Words Feature ----------
let a1Words = [];
let currentA1Index = -1;

async function loadA1Words() {
  try {
    const response = await fetch('data/a1_flashcards.json');
    a1Words = await response.json();
    console.log(`Loaded ${a1Words.length} A1 words`);
  } catch (e) {
    console.error("Failed to load A1 words:", e);
    a1Words = [];
  }
}

function showRandomA1Word() {
  if (a1Words.length === 0) {
    $("a1Preview").style.display = "none";
    $("addStatus").textContent = "⚠️ A1 words not loaded yet. Please refresh the page.";
    return;
  }

  // Get random word
  currentA1Index = Math.floor(Math.random() * a1Words.length);
  const card = a1Words[currentA1Index];

  $("a1Word").textContent = card.front.word || "—";
  $("a1Article").textContent = card.front.article || "—";
  $("a1Type").textContent = card.front.type || "—";
  $("a1Example").textContent = card.front.example || "—";
  $("a1Meaning").textContent = card.back.meaning || "—";

  $("a1Preview").style.display = "block";
}

$("btnLoadA1").onclick = showRandomA1Word;

$("btnSkipA1").onclick = showRandomA1Word;

$("btnAddA1").onclick = async () => {
  if (currentA1Index < 0 || currentA1Index >= a1Words.length) return;

  const card = a1Words[currentA1Index];
  $("addStatus").textContent = "Adding to My Words…";

  try {
    await addDoc(cardsCol(), {
      phrase: card.front.word,
      en: card.back.meaning,
      lang: "de",
      level: card.level || "A1",
      type: card.front.type || "",
      article: card.front.article || "",
      example: card.front.example || "",
      dueAt: today0(),
      lastGrade: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("addStatus").textContent = `✓ Added "${card.front.word}" to your words!`;
    setTimeout(() => {
      $("addStatus").textContent = "";
      showRandomA1Word(); // Load next word
    }, 1500);

    await refreshAll();
  } catch (e) {
    console.error("Error adding A1 word:", e);
    $("addStatus").textContent = "❌ Failed to add word. Try again.";
  }
};

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
    div.className = "listItem";
    div.dataset.cardId = c.id;
    div.innerHTML = `
      <input type="checkbox" class="item-checkbox" data-id="${c.id}" />
      <div class="listItemContent" style="cursor: pointer;">
        <div class="listItemText">${escapeHtml(c.phrase || "")}</div>
        <div class="listItemMeta">${escapeHtml(c.en || "")}</div>
      </div>
      <button class="btn-icon-delete" data-del="${c.id}" title="Delete" aria-label="Delete">🗑️</button>
    `;
    el.appendChild(div);
  }

  // Update button states
  updateDeleteButtonState();
}

function showCard(card){
  current = card;
  revealed = false;
  
  // Reset flashcard to front side
  const flashcard = $("flashcard");
  if (flashcard) {
    flashcard.classList.remove("flipped");
  }

  // Show/hide study area based on whether there are cards
  const hasCards = cards.length > 0;
  const studyArea = $("studyArea");
  const noCardsMsg = $("noCardsMsg");
  const noStudyMsg = $("noStudyMsg");
  
  if (studyArea && noCardsMsg && noStudyMsg) {
    if (!hasCards) {
      // No cards at all
      studyArea.style.display = "none";
      noCardsMsg.style.display = "block";
      noStudyMsg.style.display = "none";
    } else if (!card) {
      // Has cards but none due today
      studyArea.style.display = "none";
      noCardsMsg.style.display = "none";
      noStudyMsg.style.display = "block";
    } else {
      // Has card to study
      studyArea.style.display = "block";
      noCardsMsg.style.display = "none";
      noStudyMsg.style.display = "none";
    }
  }

  if(!card){
    $("frontText").textContent = "No cards due ✅";
    $("frontMeta").textContent = "Add more words above or come back later.";
    $("backText").textContent = "—";
    $("backExamples").textContent = "";
    return;
  }

  $("frontText").textContent = card.phrase || "—";
  $("frontMeta").textContent = `Due: ${new Date(card.dueAt).toLocaleDateString()}`;
  $("backText").textContent = card.en || "—";

  const ex = Array.isArray(card.examples) ? card.examples : [];
  $("backExamples").textContent = ex.length
    ? "Examples: " + ex.map(e => `${e.src} → ${e.en}`).join(" | ")
    : "";
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
  await loadA1Words(); // Load A1 words when user logs in
  await refreshAll();
});

// ---------- PDF EXTRACTION ----------
let extractedWordsData = [];

// Set up PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

$("btnExtractPDF").onclick = async () => {
  const file = $("pdfFile").files[0];
  if (!file) {
    $("pdfStatus").textContent = "⚠️ Please select a PDF first.";
    return;
  }

  $("pdfStatus").textContent = "📄 Reading PDF...";
  $("extractedWords").style.display = "none";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = "";

    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }

    // Extract German words (simple heuristic: capitalize words with German chars)
    const germanWords = new Set();
    const words = fullText.match(/\b[A-Zäöü][a-zäöüß-]{2,}\b/g) || [];
    
    words.forEach(word => {
      if (word.length > 2 && /[äöüß]|[A-Z]/.test(word)) {
        germanWords.add(word);
      }
    });

    extractedWordsData = Array.from(germanWords).slice(0, 50); // Limit to 50 words
    
    if (extractedWordsData.length === 0) {
      $("pdfStatus").textContent = "❌ No words found. Make sure PDF has text (not scanned images).";
      return;
    }

    // Display extracted words
    const wordsList = $("wordsList");
    wordsList.innerHTML = extractedWordsData.map((word, i) => `
      <div class="wordItem" style="display: flex; gap: 8px; padding: 8px; background: rgba(99,102,241,.08); border-radius: 8px; cursor: pointer;">
        <span style="flex: 1;">${escapeHtml(word)}</span>
        <button class="btn primary" data-word="${word}" style="padding: 4px 12px; font-size: 12px;">Add</button>
      </div>
    `).join("");

    $("extractedWords").style.display = "block";
    $("pdfStatus").textContent = `✅ Found ${extractedWordsData.length} words!`;
  } catch (e) {
    $("pdfStatus").textContent = "❌ Error reading PDF: " + (e?.message || e);
  }
};

// Add word from PDF to cards
if ($("wordsList")) {
  $("wordsList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-word]");
    if (!btn) return;

    const word = btn.dataset.word;
    btn.textContent = "⏳ Adding...";
    btn.disabled = true;

    try {
      // Try to auto-translate the word
      const { en } = await translateToEnglish(word, "de");
      
      if (!en || en.trim().length === 0) {
        btn.textContent = "Manual needed";
        alert(`Could not translate "${word}". Please add manually in Manual Entry mode.`);
        return;
      }

      // Save to Firestore
      await addDoc(cardsCol(), {
        phrase: word,
        lang: "de",
        en: en.trim(),
        examples: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        dueAt: today0(),
        lastGrade: null
      });

      btn.textContent = "✅ Added";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Add";
      }, 1500);

      await refreshAll();
    } catch (e) {
      btn.textContent = "Error";
      btn.disabled = false;
    }
  });
}

// ---------- MODE TOGGLE ----------
$("modeManual").onclick = () => {
  $("manualMode").style.display = "block";
  $("translateMode").style.display = "none";
  $("pdfMode").style.display = "none";
  $("a1Mode").style.display = "none";
  $("modeManual").style.background = "var(--primary)";
  $("modeManual").style.color = "white";
  $("modeTranslate").style.background = "transparent";
  $("modeTranslate").style.color = "var(--text)";
  $("modePDF").style.background = "transparent";
  $("modePDF").style.color = "var(--text)";
  $("modeA1").style.background = "transparent";
  $("modeA1").style.color = "var(--text)";
};

$("modeTranslate").onclick = () => {
  $("manualMode").style.display = "none";
  $("translateMode").style.display = "block";
  $("pdfMode").style.display = "none";
  $("a1Mode").style.display = "none";
  $("modeTranslate").style.background = "var(--primary)";
  $("modeTranslate").style.color = "white";
  $("modeManual").style.background = "transparent";
  $("modeManual").style.color = "var(--text)";
  $("modePDF").style.background = "transparent";
  $("modePDF").style.color = "var(--text)";
  $("modeA1").style.background = "transparent";
  $("modeA1").style.color = "var(--text)";
};

$("modePDF").onclick = () => {
  $("manualMode").style.display = "none";
  $("translateMode").style.display = "none";
  $("pdfMode").style.display = "block";
  $("a1Mode").style.display = "none";
  $("modePDF").style.background = "var(--primary)";
  $("modePDF").style.color = "white";
  $("modeManual").style.background = "transparent";
  $("modeManual").style.color = "var(--text)";
  $("modeTranslate").style.background = "transparent";
  $("modeTranslate").style.color = "var(--text)";
  $("modeA1").style.background = "transparent";
  $("modeA1").style.color = "var(--text)";
};

// A1 Words Mode
$("modeA1").onclick = () => {
  $("manualMode").style.display = "none";
  $("translateMode").style.display = "none";
  $("pdfMode").style.display = "none";
  $("a1Mode").style.display = "block";
  $("modeA1").style.background = "var(--primary)";
  $("modeA1").style.color = "white";
  $("modeManual").style.background = "transparent";
  $("modeManual").style.color = "var(--text)";
  $("modeTranslate").style.background = "transparent";
  $("modeTranslate").style.color = "var(--text)";
  $("modePDF").style.background = "transparent";
  $("modePDF").style.color = "var(--text)";
};

// ---------- Add Card (Simple Manual Entry) ----------
$("btnClearCard").onclick = () => {
  $("phraseInput").value = "";
  $("translationInput").value = "";
  $("addStatus").textContent = "";
};

// Save card directly (no translation needed)
$("btnSaveCard").onclick = async () => {
  const phrase = $("phraseInput").value.trim();
  const translation = $("translationInput").value.trim();

  if (!phrase || !translation) {
    $("addStatus").textContent = "⚠️ Please fill in both fields.";
    return;
  }

  $("addStatus").textContent = "Saving…";

  try {
    await addDoc(cardsCol(), {
      phrase: phrase,
      lang: "de",  // Assuming German by default
      en: translation,
      examples: [],  // No auto-examples for manual entry
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      dueAt: today0(),
      lastGrade: null
    });

    $("addStatus").textContent = "✅ Saved!";
    $("phraseInput").value = "";
    $("translationInput").value = "";
    
    // Clear message after 2 seconds
    setTimeout(() => {
      $("addStatus").textContent = "";
    }, 2000);
    
    await refreshAll();
  } catch (e) {
    $("addStatus").textContent = "❌ Error: " + (e?.message || e);
  }
};

// ---------- Add / Translate Mode ----------
$("btnClear").onclick = () => {
  $("phrase").value = "";
  $("preview").style.display = "none";
  $("addStatus").textContent = "";
  $("enInput").value = "";
};

$("btnTranslate").onclick = async () => {
  const text = $("phrase").value.trim();
  if (!text) {
    $("addStatus").textContent = "⚠️ Please enter a word or phrase.";
    return;
  }

  $("addStatus").textContent = "Translating…";
  $("preview").style.display = "none";

  try {
    const sourceChoice = $("sourceLang").value;
    const { from, en } = await translateToEnglish(text, sourceChoice);
    
    if (!en || en.trim().length === 0) {
      $("addStatus").textContent = "❌ Translation failed. Try another word or use Manual Entry mode.";
      return;
    }

    const examples = await fetchExamples(text, from);

    // Show preview with editable translation
    $("preview").style.display = "block";
    $("pLang").textContent = from;
    $("pEn").textContent = en;
    $("enInput").value = en; // Allow user to edit
    
    if (examples.length > 0) {
      $("pExamples").innerHTML = examples.map(x => 
        `<li><span class="exSrc">${escapeHtml(x.src)}</span> <span class="exArrow">→</span> <span class="exEn">${escapeHtml(x.en)}</span></li>`
      ).join("");
    } else {
      $("pExamples").innerHTML = "<li class='muted'>(No examples found)</li>";
    }

    $("addStatus").textContent = "✅ Preview ready. Edit if needed, then click Save.";
  } catch (e) {
    $("addStatus").textContent = "❌ Error: " + (e?.message || e);
  }
};

// Save with user-edited translation
$("btnSaveOverride").onclick = async () => {
  const text = $("phrase").value.trim();
  const enEdited = $("enInput").value.trim();

  if (!text || !enEdited) {
    $("addStatus").textContent = "⚠️ Please fill in both phrase and English translation.";
    return;
  }

  $("addStatus").textContent = "Saving…";

  try {
    const sourceChoice = $("sourceLang").value;
    const { from } = await translateToEnglish(text, sourceChoice);
    const examples = await fetchExamples(text, from);

    await addDoc(cardsCol(), {
      phrase: text,
      lang: from,
      en: enEdited,
      examples: examples.filter(e => e.en !== "(German example only)"),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      dueAt: today0(),
      lastGrade: null
    });

    $("addStatus").textContent = "✅ Saved!";
    $("phrase").value = "";
    $("preview").style.display = "none";
    $("enInput").value = "";
    
    setTimeout(() => {
      $("addStatus").textContent = "";
    }, 2000);
    
    await refreshAll();
  } catch (e) {
    $("addStatus").textContent = "❌ Error: " + (e?.message || e);
  }
};

// ---------- Study controls ----------
// (btnReveal no longer needed - flashcard flips on click)

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

// list events: delete, select, and open card
$("list").addEventListener("click", async (e) => {
  // Handle delete button click
  const id = e.target?.dataset?.del;
  if(id) {
    if(!confirm("Delete this card permanently?")) return;
    await deleteDoc(doc(db, `users/${user.uid}/cards/${id}`));
    await refreshAll();
    return;
  }

  // Handle checkbox click
  if(e.target.classList.contains("item-checkbox")) {
    updateDeleteButtonState();
    return;
  }

  // Handle word click - find the list item and open the card in study box
  const listItem = e.target.closest(".listItem");
  if(listItem && !e.target.closest(".btn-icon-delete")) {
    const cardId = listItem.dataset.cardId;
    if(cardId) {
      const card = cards.find(c => c.id === cardId);
      if(card) {
        showCard(card);
      }
    }
  }
});

$("search").addEventListener("input", renderList);

// Multi-select all (toggle)
$("btnSelectAll").onclick = () => {
  const checkboxes = document.querySelectorAll(".item-checkbox");
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => cb.checked = !allChecked);
  updateDeleteButtonState();
};

// Delete selected
$("btnDeleteSelected").onclick = async () => {
  const ids = getSelectedIds();
  if (ids.length === 0) return;

  if (!confirm(`Delete ${ids.length} card(s) permanently?`)) return;

  $("btnDeleteSelected").disabled = true;
  $("btnDeleteSelected").textContent = "Deleting…";

  try {
    for (const id of ids) {
      await deleteDoc(doc(db, `users/${user.uid}/cards/${id}`));
    }
    await refreshAll();
  } catch (e) {
    console.error("Error deleting cards:", e);
    alert("Error deleting some cards");
    $("btnDeleteSelected").disabled = false;
    $("btnDeleteSelected").textContent = `Delete Selected`;
  }
};

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
