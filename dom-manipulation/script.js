


const SERVER_URL = "https://jsonplaceholder.typicode.com/posts"; // Mock endpoint
const POLL_INTERVAL = 15000;

const LS_QUOTES = "dq_quotes_v1";
const LS_SELECTED_CATEGORY = "dq_selectedCategory";


function nowISO() { return new Date().toISOString(); }
function uid() { return Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36); }

let quotes = JSON.parse(localStorage.getItem(LS_QUOTES)) || [
  { id: uid(), text: "The only limit to our realization of tomorrow is our doubts of today.", category: "Motivation", updatedAt: nowISO() },
  { id: uid(), text: "In the middle of every difficulty lies opportunity.", category: "Inspiration", updatedAt: nowISO() },
  { id: uid(), text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", category: "Perseverance", updatedAt: nowISO() },
];

let pendingConflicts = [];
let pollHandle = null;


let quoteContainer, categorySelect, formContainer, syncBanner, conflictModal, conflictList;

function saveLocalQuotes() {
  localStorage.setItem(LS_QUOTES, JSON.stringify(quotes));
}


function populateCategories() {
  if (!categorySelect) return;

  const categories = [...new Set(quotes.map(q => q.category))].sort();
  categorySelect.innerHTML = '<option value="all">All Categories</option>';

  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  const saved = localStorage.getItem(LS_SELECTED_CATEGORY);
  if (saved) categorySelect.value = saved;
}

function showRandomQuote() {
  if (!quoteContainer) return;

  const selected = categorySelect?.value || "all";
  const filtered = selected === "all" ? quotes : quotes.filter(q => q.category === selected);

  if (filtered.length === 0) {
    quoteContainer.textContent = "No quotes available for this category.";
    return;
  }

  const randomIndex = Math.floor(Math.random() * filtered.length);
  const q = filtered[randomIndex];

  quoteContainer.innerHTML = `
    <p class="quote-text">"${q.text}"</p>
    <p class="quote-category">– <strong>${q.category}</strong></p>
    <p class="meta small">id: ${q.id} — updated: ${q.updatedAt}</p>
  `;

  // Save last viewed in sessionStorage
  sessionStorage.setItem("lastQuote", JSON.stringify(q));
}

function filterQuotes() {
  if (!categorySelect) return;
  localStorage.setItem(LS_SELECTED_CATEGORY, categorySelect.value);
  showRandomQuote();
}

// === Add Quote Form ===
function createAddQuoteForm() {
  if (!formContainer) return;

  formContainer.innerHTML = "";
  const form = document.createElement("form");
  form.className = "quote-form";

  const quoteInput = document.createElement("input");
  quoteInput.placeholder = "Enter quote text";
  quoteInput.required = true;

  const catInput = document.createElement("input");
  catInput.placeholder = "Enter category";
  catInput.required = true;

  const submit = document.createElement("button");
  submit.textContent = "Add Quote";
  submit.type = "submit";

  form.appendChild(quoteInput);
  form.appendChild(catInput);
  form.appendChild(submit);
  formContainer.appendChild(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = quoteInput.value.trim();
    const cat = catInput.value.trim();

    if (!text || !cat) return alert("Please fill in both fields.");

    const newQuote = { id: uid(), text, category: cat, updatedAt: nowISO() };
    quotes.push(newQuote);
    saveLocalQuotes();

    populateCategories();
    filterQuotes();

    try {
      await pushLocalQuoteToServer(newQuote);
    } catch (err) {
      console.warn("Failed to push quote to server:", err);
    }

    alert("✅ Quote added!");
    form.reset();
  });
}

// === Server Sync Helpers ===
async function fetchServerQuotes() {
  const res = await fetch(SERVER_URL);
  if (!res.ok) throw new Error("Server fetch failed: " + res.status);
  const data = await res.json();

  // Mock conversion — JSONPlaceholder returns posts, not quotes
  return data.slice(0, 5).map(d => ({
    id: d.id.toString(),
    text: d.title,
    category: "Server",
    updatedAt: nowISO()
  }));
}

async function pushLocalQuoteToServer(quote) {
  const res = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quote),
  });
  if (!res.ok) throw new Error("POST failed: " + res.status);
  return await res.json();
}

// === Sync & Conflict Handling ===
async function syncFromServer() {
  try {
    const serverQuotes = await fetchServerQuotes();

    const localMap = new Map(quotes.map(q => [q.id, q]));
    const newLocal = [];
    const conflicts = [];

    for (const s of serverQuotes) {
      const l = localMap.get(s.id);
      if (!l) {
        newLocal.push(s); // server-only
      } else if (s.text !== l.text || s.category !== l.category) {
        conflicts.push({ id: s.id, server: s, local: l });
        newLocal.push(s); // server wins by default
      } else {
        newLocal.push(l);
      }
      localMap.delete(s.id);
    }

    for (const [id, l] of localMap) newLocal.push(l);

    quotes = newLocal;
    saveLocalQuotes();

    if (conflicts.length > 0) {
      pendingConflicts = conflicts;
      showBanner(`${conflicts.length} conflicts auto-resolved (server version kept).`);
    } else {
      showBanner("✅ Synced with server.");
      setTimeout(hideBanner, 3000);
    }

    populateCategories();
    filterQuotes();
  } catch (err) {
    console.error("Sync error:", err);
  }
}

// === Conflict Modal ===
function openConflictModal() {
  if (!conflictModal || !conflictList) return;
  conflictList.innerHTML = "";

  if (pendingConflicts.length === 0) {
    conflictList.innerHTML = "<p>No conflicts to resolve.</p>";
  } else {
    pendingConflicts.forEach((c, i) => {
      const div = document.createElement("div");
      div.className = "conflictItem";
      div.innerHTML = `
        <p><strong>ID:</strong> ${c.id}</p>
        <div><strong>Local:</strong> ${c.local.text} (${c.local.category})</div>
        <div><strong>Server:</strong> ${c.server.text} (${c.server.category})</div>
        <label><input type="radio" name="conf-${i}" value="server" checked> Keep Server</label>
        <label><input type="radio" name="conf-${i}" value="local"> Keep Local</label>
      `;
      conflictList.appendChild(div);
    });
  }

  conflictModal.style.display = "flex";
}

function applyResolutions() {
  pendingConflicts.forEach((c, i) => {
    const choice = document.querySelector(`input[name="conf-${i}"]:checked`).value;
    quotes = quotes.map(q => (q.id === c.id ? (choice === "local" ? c.local : c.server) : q));
  });
  saveLocalQuotes();
  pendingConflicts = [];
  closeConflictModal();
  populateCategories();
  filterQuotes();
  hideBanner();
}

function closeConflictModal() {
  if (conflictModal) conflictModal.style.display = "none";
}

// === Sync Banner ===
function showBanner(msg) {
  if (!syncBanner) return;
  document.getElementById("bannerText").textContent = msg;
  syncBanner.classList.remove("hidden");
}
function hideBanner() {
  if (syncBanner) syncBanner.classList.add("hidden");
}

// === Polling ===
function startPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(syncFromServer, POLL_INTERVAL);
}

// === Initialization ===
window.addEventListener("DOMContentLoaded", () => {
  quoteContainer = document.getElementById("quoteDisplay");
  categorySelect = document.getElementById("categoryFilter");
  formContainer = document.getElementById("formContainer");
  syncBanner = document.getElementById("syncBanner");
  conflictModal = document.getElementById("conflictModal");
  conflictList = document.getElementById("conflictList");

  populateCategories();
  createAddQuoteForm();

  const last = sessionStorage.getItem("lastQuote");
  if (last) {
    const q = JSON.parse(last);
    quoteContainer.innerHTML = `<p class="quote-text">"${q.text}"</p>
      <p class="quote-category">– <strong>${q.category}</strong></p>`;
  } else {
    showRandomQuote();
  }

  if (categorySelect) categorySelect.addEventListener("change", filterQuotes);

  startPolling();
  syncFromServer();
});
