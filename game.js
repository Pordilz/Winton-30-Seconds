(() => {
  "use strict";

  const CARD_SIZE = 5;
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 6;
  const LETTERS = "ABCDEF";
  const KEYS = {
    game: "winton30.game", custom: "winton30.custom", prefs: "winton30.prefs", remote: "winton30.remote",
    quiz: "winton30.quiz", quizGame: "winton30.quizgame", quizSeen: "winton30.quizseen", quizPrefs: "winton30.quizprefs",
  };
  const LIMITS = { target: [5, 100], seconds: [10, 90] };

  // The classic die takes 0, 1 or 2 off the turn. The Chaos die keeps one of
  // each and swaps the duplicates for faces that change the rules instead.
  const CLASSIC_DIE = [0, 0, 1, 1, 2, 2];
  const CHAOS_DIE = [0, 1, 2, "mime", "three", "double"];
  const TWISTS = {
    mime: { face: "MIME", big: "Mime it", banner: "Mime it · no talking", receipt: "Mime it",
      note: "No talking this turn. Act everything out. Nothing comes off." },
    three: { face: "3 WORDS", big: "3 words", banner: "Three words per clue", receipt: "3 words",
      note: "Every clue is three words or fewer. Nothing comes off." },
    double: { face: "×2", big: "×2", banner: "Double points", receipt: "Double",
      note: "Double points this turn, and nothing comes off." },
  };
  const PIPS = { 0: [], 1: [4], 2: [2, 6] };

  // One riso ink per team, with a text colour that passes contrast on it.
  const TEAM_INKS = [
    { bg: "#A27BFF", fg: "#1F2650" },
    { bg: "#3255A4", fg: "#F3EEE3" },
    { bg: "#FFE800", fg: "#1F2650" },
    { bg: "#006A70", fg: "#F3EEE3" },
    { bg: "#FF6C2F", fg: "#1F2650" },
    { bg: "#FF48B0", fg: "#1F2650" },
  ];
  const AWARD_INKS = [TEAM_INKS[0], TEAM_INKS[1], TEAM_INKS[2], { bg: "#1F2650", fg: "#F3EEE3" }];
  const BURST = "22,1 25.8,5.4 31.1,3.1 32.6,8.7 38.4,8.9 37.3,14.6 42.5,17.3 39,22 42.5,26.7 37.3,29.4 38.4,35.1 32.6,35.3 31.1,40.9 25.8,38.6 22,43 18.2,38.6 12.9,40.9 11.4,35.3 5.6,35.1 6.7,29.4 1.5,26.7 5,22 1.5,17.3 6.7,14.6 5.6,8.9 11.4,8.7 12.9,3.1 18.2,5.4";

  const $ = (sel) => document.querySelector(sel);

  let setup = null;  // { names, target, seconds, chaos }
  let game = null;   // { teams, target, seconds, chaos, current, deck, history }
  let turn = null;   // { die, card: [{ term, category, got }], from } (card holds every term dealt this turn; from is where the card on screen starts)
  let timerId = null;
  let wakeLock = null;
  let pendingImport = [];
  let pickedCat = null;

  // ------------------------------------------------------------------ helpers

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "style") Object.assign(node.style, value);
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((c) => c != null));
    return node;
  }

  // Static, trusted SVG markup only.
  function svg(markup) {
    const t = document.createElement("template");
    t.innerHTML = markup.trim();
    return t.content.firstChild;
  }

  const ARROW = '<svg class="arrow" aria-hidden="true" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 8h18M13 2l6 6-6 6"/></svg>';
  const TICK = '<svg aria-hidden="true" width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="3"><path d="M1.5 6.5l3.5 3.5 7.5-8.5"/></svg>';

  const pad = (n) => String(n).padStart(2, "0");
  const rand = (n) => Math.floor(Math.random() * n);
  const termKey = (term) => term.trim().toLowerCase();
  // Looser key for spotting duplicates: "The Lambo", "the lambo!" and
  // "TheLambo" are the same term. Emoji-only terms fall back to termKey.
  const dupKey = (term) => {
    const key = termKey(term).normalize("NFKD").replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
    return key || termKey(term);
  };

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function setPlates(node, text) {
    node.textContent = text;
    node.dataset.text = text;
  }

  // The browser tab follows the game: whose turn it is, and the clock while
  // it's running, so a glance at the tab says what's happening.
  const TAB = "Winton · 30 Seconds";
  function tabTitle(name) {
    const team = game && game.teams[game.current] ? game.teams[game.current].name : "";
    const quizTeamName = quiz && quiz.teams[quiz.current] ? quiz.teams[quiz.current].name : "";
    return {
      deck: "Feed the deck · Winton",
      lore: "The lore · Winton",
      import: "New terms · Winton",
      handoff: `${team} up next · Winton`,
      review: "Time's up · Winton",
      winner: `🏆 ${team} win · Winton`,
      "quiz-setup": "The quiz · Winton",
      "quiz-turn": `${quizTeamName} up next · Winton quiz`,
      "quiz-reveal": "The reveal · Winton quiz",
      "quiz-end": "🏆 The podium · Winton quiz",
    }[name] || TAB;
  }

  function tabClock(seconds, who) {
    document.title = `${seconds <= 5 ? "🔴" : "⏱"} ${seconds}s · ${who}`;
  }

  // Shows one screen and hides the rest. The online screens in online.js
  // come through here too, so every screen is found from the page itself.
  function show(name, title) {
    if (title) document.title = title;
    else if (!["play", "quiz-q"].includes(name)) document.title = tabTitle(name);
    document.body.dataset.screen = name;
    for (const screen of document.querySelectorAll("#app > .screen")) {
      screen.hidden = screen.id !== name;
      screen.classList.toggle("feed", screen.id === name);
    }
    window.scrollTo(0, 0);
  }

  let toastTimer = null;
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch {}
    },
  };

  // Paper grain: one small noise tile, generated once and repeated.
  function makeGrain() {
    try {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random();
        img.data[i] = 31; img.data[i + 1] = 38; img.data[i + 2] = 80;
        img.data[i + 3] = v > 0.62 ? Math.round((v - 0.62) * 190) : 0;
      }
      ctx.putImageData(img, 0, 0);
      document.documentElement.style.setProperty("--grain", `url(${canvas.toDataURL()})`);
    } catch {}
  }

  // ------------------------------------------------------------------ terms
  //
  // The deck and the lore live in the group's Supabase database when
  // config.js has the project details. The phone keeps a copy, so the game
  // still works with no signal. words.js is the starter deck for a phone that
  // has never connected, or a copy of the game with no database at all.

  const TABLES = { terms: "winton_terms", lore: "winton_lore", quiz: "winton_quiz" };
  const REMOTE = typeof SUPABASE === "object" && SUPABASE && SUPABASE.url && SUPABASE.key
    ? { url: String(SUPABASE.url).replace(/\/+$/, ""), key: String(SUPABASE.key) }
    : null;

  let BASE_TERMS = [];        // [{ term, category, level, why, families }]
  let RECEIPT_MAP = new Map(); // termKey -> term with a difficulty or a receipt
  let FAMILY_MAP = new Map();  // termKey -> the database's family tags
  let LORE_DATA = null;
  let groupRows = [];          // raw rows from the database, for "just added"
  let deckSource = "starter";  // "starter" | "group"

  function starterTerms() {
    const words = typeof WORDS === "object" && WORDS ? WORDS : {};
    const list = [];
    for (const [category, terms] of Object.entries(words)) {
      if (!Array.isArray(terms)) continue;
      for (const raw of terms) list.push({ term: String(raw).trim(), category });
    }
    return list;
  }

  function fromRows(rows) {
    return rows
      .filter((r) => r && typeof r.term === "string" && r.term.trim())
      .map((r) => ({
        term: r.term.trim(),
        category: String(r.category || "Added").trim() || "Added",
        level: clampInt(r.difficulty, 1, 3, 0),
        why: typeof r.receipt === "string" ? r.receipt.trim() : "",
        families: Array.isArray(r.families) ? r.families.map((f) => String(f).trim().toLowerCase()).filter(Boolean) : [],
      }));
  }

  function useDeck(terms, lore, rows, source) {
    BASE_TERMS = terms;
    LORE_DATA = lore && typeof lore === "object" ? lore : null;
    groupRows = Array.isArray(rows) ? rows : [];
    deckSource = source;
    RECEIPT_MAP = new Map(terms.filter((t) => t.level || t.why).map((t) => [termKey(t.term), t]));
    FAMILY_MAP = new Map(terms.filter((t) => t.families && t.families.length).map((t) => [termKey(t.term), t.families]));
  }

  // Start from this phone's copy of the group deck if there is one.
  (() => {
    const cached = REMOTE ? store.get(KEYS.remote, null) : null;
    if (cached && Array.isArray(cached.terms) && cached.terms.length) {
      useDeck(fromRows(cached.terms), cached.lore, cached.terms, "group");
    } else {
      useDeck(starterTerms(), null, [], "starter");
    }
  })();

  const receiptFor = (term) => RECEIPT_MAP.get(termKey(term));

  async function api(path, options = {}) {
    const headers = { apikey: REMOTE.key, "Content-Type": "application/json", ...(options.headers || {}) };
    // New-style publishable keys go in apikey only; legacy anon keys are JWTs.
    if (!REMOTE.key.startsWith("sb_")) headers.Authorization = `Bearer ${REMOTE.key}`;
    const res = await fetch(`${REMOTE.url}/rest/v1/${path}`, { ...options, headers });
    if (!res.ok) {
      const err = new Error(`Supabase ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 201 || res.status === 204 ? null : res.json();
  }

  // Pull the latest deck and lore. Resolves false (and changes nothing) when
  // there's no signal, so the game carries on with what it has.
  let syncing = null;
  function syncDeck() {
    if (!REMOTE) return Promise.resolve(false);
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const [rows, lore] = await Promise.all([
          api(`${TABLES.terms}?select=term,category,difficulty,receipt,families,source,created_at&order=id`),
          api(`${TABLES.lore}?select=data&key=eq.winton`).catch(() => []),
        ]);
        if (!Array.isArray(rows) || !rows.length) return false;
        const cache = { terms: rows, lore: Array.isArray(lore) && lore[0] ? lore[0].data : null, at: Date.now() };
        store.set(KEYS.remote, cache);
        useDeck(fromRows(rows), cache.lore, rows, "group");
        onDeckChanged();
        return true;
      } catch {
        return false;
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  // Sends terms to the group deck and returns how many were new. Throws if
  // the database can't be reached.
  async function sendToGroup(list) {
    const post = (rows) => api(TABLES.terms, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows.map((t) => ({ term: t.term, category: t.category }))),
    });
    try {
      await post(list);
      return list.length;
    } catch (err) {
      if (err.status !== 409) throw err;
      // Someone already added one of these, so go one at a time.
      let sent = 0;
      for (const t of list) {
        try {
          await post([t]);
          sent++;
        } catch (e) {
          if (e.status !== 409) throw e;
        }
      }
      return sent;
    }
  }

  function customTerms() {
    const list = store.get(KEYS.custom, []);
    return Array.isArray(list)
      ? list.filter((t) => t && typeof t.term === "string" && t.term.trim())
      : [];
  }

  function allTerms() {
    const seen = new Set();
    const out = [];
    for (const t of [...BASE_TERMS, ...customTerms()]) {
      const key = dupKey(t.term);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ term: t.term.trim(), category: t.category || "Added" });
    }
    return out;
  }

  function categoryList() {
    const cats = [];
    for (const t of [...BASE_TERMS, ...customTerms()]) {
      if (t.category && !cats.includes(t.category)) cats.push(t.category);
    }
    return cats.length ? cats : ["Added"];
  }

  function cleanNew(list) {
    const existing = new Set(allTerms().map((t) => dupKey(t.term)));
    const out = [];
    for (const t of list) {
      const term = String(t.term || "").trim().slice(0, 80);
      const key = dupKey(term);
      if (!key || existing.has(key)) continue;
      existing.add(key);
      out.push({ term, category: String(t.category || "Added").trim().slice(0, 30) || "Added" });
    }
    return out;
  }

  // New terms go straight into the group deck. With no signal (or no
  // database) they wait on this phone instead.
  async function addTerms(list) {
    const fresh = cleanNew(list);
    if (!fresh.length) return { added: 0, shared: false };
    if (REMOTE) {
      try {
        const added = await sendToGroup(fresh);
        await syncDeck();
        return { added, shared: true };
      } catch {}
    }
    store.set(KEYS.custom, [...customTerms(), ...fresh]);
    return { added: fresh.length, shared: false };
  }

  // Terms that were added offline, sent on once there's signal.
  async function pushLocal() {
    const mine = customTerms();
    if (!REMOTE || !mine.length) return;
    $("#push-local").disabled = true;
    try {
      const sent = await sendToGroup(mine);
      store.set(KEYS.custom, []);
      await syncDeck();
      toast(sent ? `Sent ${sent} term${sent === 1 ? "" : "s"} to the group deck.` : "The group deck already had all of those.");
    } catch {
      toast("Couldn't reach the group deck. Try again when you have signal.");
    }
    $("#push-local").disabled = false;
    renderDeck();
    updateDeckInfo();
  }

  // Refresh whatever's on screen after the deck or lore changes.
  function onDeckChanged() {
    if (!setup) return;
    updateDeckInfo();
    renderSettings();
    const enough = allTerms().length >= CARD_SIZE;
    $("#start-game").disabled = !enough;
    if (enough && $("#setup-error").textContent === DECK_SHORT) setupError("");
    $("#open-lore").hidden = !LORE_DATA && !REMOTE;
    if (!$("#deck").hidden) renderDeck();
    if (!$("#lore").hidden) renderLore();
  }

  // Related terms give each other away ("Meta AI" next to "Ask Meta AI"), so
  // no two terms on a card share a family: the database's family tags plus
  // the meaningful words in the term itself.
  const STOPWORDS = new Set(("the and for from with not you your are was who what whats why how when this that " +
    "they them his her its our him she can will there here gonna just like get got all yes did does have has " +
    "had been into out off over than then also very too ever never only one two day night era poll man men").split(" "));

  function familiesOf(term) {
    const fams = new Set(FAMILY_MAP.get(termKey(term)) || []);
    const words = term.toLowerCase().replace(/['\u2019]s\b/g, "").split(/[^a-z]+/);
    for (const w of words) if (w.length >= 3 && !STOPWORDS.has(w)) fams.add(w);
    return fams;
  }

  // Deals five terms from the top of a deck (game.deck here, or an online
  // room's deck), skipping any that clash with the card so far. The first
  // pass also wants five different categories; later passes relax that,
  // then the family rule, so a card always fills.
  function drawCard() { return dealCard(game); }

  function dealCard(holder) {
    if (holder.deck.length < CARD_SIZE * 3) {
      const left = new Set(holder.deck.map((t) => termKey(t.term)));
      holder.deck.push(...shuffle(allTerms().filter((t) => !left.has(termKey(t.term)))));
    }
    const picked = [];
    const taken = new Set();
    const cats = new Set();
    const pass = (newCategory, newFamilies) => {
      for (let i = 0; i < holder.deck.length && picked.length < CARD_SIZE; i++) {
        const t = holder.deck[i];
        if (!t || (newCategory && cats.has(t.category))) continue;
        const fams = familiesOf(t.term);
        if (newFamilies && [...fams].some((f) => taken.has(f))) continue;
        picked.push(t);
        fams.forEach((f) => taken.add(f));
        cats.add(t.category);
        holder.deck[i] = null;
      }
    };
    pass(true, true);
    pass(false, true);
    pass(false, false);
    holder.deck = holder.deck.filter(Boolean);
    return picked.map((t) => ({ ...t, got: false }));
  }

  // Share links carry terms in the URL hash as base64url-encoded JSON, so no
  // server is needed: #add=<code>
  function encodeTerms(list) {
    const json = JSON.stringify(list.map((t) => [t.term, t.category]));
    let bin = "";
    new TextEncoder().encode(json).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeTerms(code) {
    try {
      const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (!Array.isArray(data)) return [];
      return data
        .filter((row) => Array.isArray(row) && typeof row[0] === "string")
        .slice(0, 500)
        .map(([term, category]) => ({
          term: term.trim().slice(0, 80),
          category: String(category || "Added").trim().slice(0, 30) || "Added",
        }))
        .filter((t) => t.term);
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------ sound + device

  let audio = null;

  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch {}
  }

  function beep(freq, duration, volume = 0.2) {
    if (!audio) return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audio.destination);
      const now = audio.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  function haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
  }

  async function keepScreenOn(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  // ------------------------------------------------------------------ saving

  function saveGame() { store.set(KEYS.game, game); }

  function loadSaved() {
    const data = store.get(KEYS.game, null);
    if (!data || !Array.isArray(data.teams) || data.teams.length < MIN_TEAMS) return null;
    data.teams.forEach((t, i) => { if (typeof t.ink !== "number") t.ink = i % TEAM_INKS.length; });
    if (!Array.isArray(data.history)) data.history = [];
    data.chaos = !!data.chaos;
    if (!Array.isArray(data.deck)) data.deck = shuffle(allTerms());
    data.current = clampInt(data.current, 0, data.teams.length - 1, 0);
    return data;
  }

  // ------------------------------------------------------------------ setup

  function initSetup(prefill) {
    const prefs = store.get(KEYS.prefs, {}) || {};
    const savedNames = Array.isArray(prefs.names) && prefs.names.length >= MIN_TEAMS ? prefs.names : null;
    setup = {
      names: (prefill?.names ?? savedNames ?? ["Team 1", "Team 2"]).slice(0, MAX_TEAMS),
      target: clampInt(prefill?.target ?? prefs.target, ...LIMITS.target, 25),
      seconds: clampInt(prefill?.seconds ?? prefs.seconds, ...LIMITS.seconds, 30),
      chaos: !!(prefill?.chaos ?? prefs.chaos),
    };
    renderTeamInputs();
    renderSettings();
    updateDeckInfo();
    $("#resume").hidden = !loadSaved();
    $("#open-lore").hidden = !LORE_DATA && !REMOTE;

    const enough = allTerms().length >= CARD_SIZE;
    $("#start-game").disabled = !enough;
    setupError(enough ? "" : DECK_SHORT);
  }

  const DECK_SHORT = `Add at least ${CARD_SIZE} terms to the deck to play.`;

  function updateDeckInfo() {
    const total = allTerms().length;
    const mine = customTerms().length;
    const where = mine ? `${mine} only on this phone` : deckSource === "group" ? "the group deck" : "starter deck";
    $("#deck-info").textContent = `${total} terms · ${where}`;
  }

  function setupError(message) {
    const node = $("#setup-error");
    node.textContent = message || "";
    node.hidden = !message;
  }

  function renderTeamInputs() {
    renderTeamList($("#team-list"), $("#add-team"), setup.names, renderTeamInputs);
  }

  // The editable list of team names, shared by the game and the quiz.
  function renderTeamList(list, addBtn, names, rerender) {
    list.replaceChildren(...names.map((name, i) => {
      const ink = TEAM_INKS[i % TEAM_INKS.length];
      const input = el("input", { type: "text", maxlength: "30", autocomplete: "off", enterkeyhint: "next" });
      input.value = name;
      input.addEventListener("input", () => { names[i] = input.value; });
      const label = el("label", {}, el("span", { class: "sr-only", text: `Team ${LETTERS[i]} name` }), input);
      const li = el("li", {},
        el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
        label);
      if (names.length > MIN_TEAMS) {
        const remove = el("button", { type: "button", class: "remove", "aria-label": `Remove team ${LETTERS[i]}`, text: "×" });
        remove.addEventListener("click", () => {
          names.splice(i, 1);
          rerender();
        });
        li.append(remove);
      }
      return li;
    }));
    addBtn.hidden = names.length >= MAX_TEAMS;
  }

  function renderSettings() {
    for (const key of ["target", "seconds"]) {
      $("#" + key).textContent = setup[key];
      for (const btn of document.querySelectorAll(`[data-setting="${key}"]`)) {
        const step = Number(btn.dataset.step);
        btn.disabled = step < 0 ? setup[key] <= LIMITS[key][0] : setup[key] >= LIMITS[key][1];
      }
    }
    $("#chaos").setAttribute("aria-checked", String(setup.chaos));
  }

  document.querySelectorAll("[data-setting]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.setting;
      setup[key] = clampInt(setup[key] + Number(btn.dataset.step), ...LIMITS[key], setup[key]);
      renderSettings();
    });
  });

  $("#chaos").addEventListener("click", () => {
    setup.chaos = !setup.chaos;
    renderSettings();
  });

  $("#add-team").addEventListener("click", () => {
    setup.names.push(`Team ${setup.names.length + 1}`);
    renderTeamInputs();
    const input = $("#team-list li:last-child input");
    input.focus();
    input.select();
  });

  $("#start-game").addEventListener("click", () => {
    const names = setup.names.map((n, i) => n.trim() || `Team ${i + 1}`);
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return setupError("Give each team a different name.");
    setupError("");
    store.set(KEYS.prefs, { names, target: setup.target, seconds: setup.seconds, chaos: setup.chaos });
    unlockAudio();
    startGame({ ...setup, names });
  });

  $("#resume").addEventListener("click", () => {
    game = loadSaved();
    if (!game) return initSetup();
    showHandoff();
  });

  $("#open-deck").addEventListener("click", openDeck);
  $("#open-lore").addEventListener("click", openLore);

  function startGame({ names, target, seconds, chaos }, deck) {
    game = {
      teams: names.map((name, i) => ({ name, score: 0, ink: i % TEAM_INKS.length })),
      target,
      seconds,
      chaos,
      current: 0,
      deck: deck && deck.length >= CARD_SIZE ? deck : shuffle(allTerms()),
      history: [],
    };
    saveGame();
    showHandoff();
  }

  // ------------------------------------------------------------------ deck builder

  function openDeck() {
    renderDeck();
    show("deck");
  }

  function renderDeck() {
    const cats = categoryList();
    if (!cats.includes(pickedCat)) pickedCat = cats[0];

    $("#cat-chips").replaceChildren(...cats.map((cat) => {
      const chip = el("button", { type: "button", "aria-pressed": String(cat === pickedCat), text: cat });
      chip.addEventListener("click", () => { pickedCat = cat; renderDeck(); });
      return chip;
    }));

    const shared = REMOTE && deckSource === "group";
    $("#deck-mode").textContent = !REMOTE
      ? "Terms you add stay on this phone until you share them."
      : shared
        ? "New terms go into the group deck. Everyone gets them the next time they open the game."
        : "Can't reach the group deck right now. New terms wait on this phone until there's signal.";

    const mine = customTerms();
    $("#mine-list").replaceChildren(...mine.map((t, i) => ({ t, i })).reverse().map(({ t, i }) => {
      const remove = el("button", { type: "button", class: "x", "aria-label": `Remove ${t.term}`, text: "×" });
      remove.addEventListener("click", () => {
        const list = customTerms();
        list.splice(i, 1);
        store.set(KEYS.custom, list);
        renderDeck();
      });
      return el("li", {}, el("span", { class: "t", text: t.term }), el("span", { class: "c", text: t.category }), remove);
    }));
    $("#mine-count").textContent = mine.length;
    $("#mine-empty").hidden = mine.length > 0;
    $("#mine-empty").textContent = REMOTE
      ? "Nothing waiting. Terms only end up here when there's no signal."
      : "Nothing yet. Terms you add here stay on this phone until you share them.";
    $("#push-local").hidden = !REMOTE || !mine.length;

    // The latest terms anyone in the group has added.
    const recent = groupRows
      .filter((r) => r && r.source === "player" && typeof r.term === "string")
      .slice(-12)
      .reverse();
    $("#recent").hidden = !recent.length;
    $("#recent-list").replaceChildren(...recent.map((r) =>
      el("li", {}, el("span", { class: "t", text: r.term }), el("span", { class: "c", text: r.category || "Added" }))));

    // With a shared deck there's nothing to send around by hand.
    $("#share-link").hidden = !!REMOTE;
    $("#share-note").hidden = !!REMOTE;
    $("#copy-words").hidden = !!REMOTE;
    $(".share-row").classList.toggle("solo", !!REMOTE);

    $("#deck-total").textContent = `${allTerms().length} terms in the deck`;
  }

  function addedMessage({ added, shared }, tried) {
    const skipped = tried - added;
    const where = shared ? "the group deck" : "this phone";
    if (!added) return tried === 1 ? "That one's already in the deck." : "All of those are already in the deck.";
    return `Added ${added} term${added === 1 ? "" : "s"} to ${where}${skipped ? `, skipped ${skipped} already in` : ""}.`;
  }

  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#new-term");
    const button = $("#add-btn");
    const term = input.value.trim();
    if (!term) return input.focus();
    // A list typed into the one box ("a, b, c") becomes separate terms.
    const parts = term.split(",").map((t) => t.trim()).filter(Boolean);
    const terms = parts.length > 1 && window.confirm(`Add these as ${parts.length} separate terms?\n\n${parts.join("\n")}`)
      ? parts : [term];
    button.disabled = true;
    const result = await addTerms(terms.map((t) => ({ term: t, category: pickedCat })));
    button.disabled = false;
    if (terms.length > 1) toast(addedMessage(result, terms.length));
    if (result.added) {
      haptic(15);
      input.value = "";
      if (REMOTE && !result.shared) toast("No signal. Saved on this phone for now.");
    } else if (terms.length === 1) {
      toast("That one's already in the deck.");
    }
    renderDeck();
    input.focus();
  });

  $("#paste-toggle").addEventListener("click", () => {
    const panel = $("#paste-panel");
    panel.hidden = !panel.hidden;
    $("#paste-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("#paste-text").focus();
  });

  $("#paste-add").addEventListener("click", async () => {
    const lines = $("#paste-text").value
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 300);
    if (!lines.length) return $("#paste-text").focus();
    $("#paste-add").disabled = true;
    const result = await addTerms(lines.map((term) => ({ term, category: pickedCat })));
    $("#paste-add").disabled = false;
    toast(addedMessage(result, lines.length));
    $("#paste-text").value = "";
    $("#paste-panel").hidden = true;
    $("#paste-toggle").setAttribute("aria-expanded", "false");
    renderDeck();
  });

  $("#push-local").addEventListener("click", pushLocal);

  $("#share-link").addEventListener("click", async () => {
    const mine = customTerms();
    if (!mine.length) return toast("Add a few terms first, then share them.");
    const url = `${location.href.split("#")[0]}#add=${encodeTerms(mine)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Winton 30 Seconds", text: `${mine.length} terms for the deck`, url });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Paste it in the group chat.");
    } catch {
      window.prompt("Copy this link and send it to the group:", url);
    }
  });

  $("#copy-words").addEventListener("click", async () => {
    const mine = customTerms();
    if (!mine.length) return toast("Nothing added on this phone yet.");
    const byCat = {};
    for (const t of mine) (byCat[t.category] ||= []).push(t.term);
    const snippet = Object.entries(byCat)
      .map(([cat, terms]) => `  ${JSON.stringify(cat)}: [\n${terms.map((t) => `    ${JSON.stringify(t)},`).join("\n")}\n  ],`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(snippet);
      toast("Copied. Paste it inside WORDS in words.js.");
    } catch {
      window.prompt("Copy these lines into words.js:", snippet);
    }
  });

  $("#deck-back").addEventListener("click", () => {
    updateDeckInfo();
    const enough = allTerms().length >= CARD_SIZE;
    $("#start-game").disabled = !enough;
    setupError(enough ? "" : DECK_SHORT);
    show("setup");
  });

  // ------------------------------------------------------------------ the lore

  const LORE_TABS = [["squad", "The squad"], ["cast", "Side characters"], ["numbers", "By the numbers"], ["eras", "Eras"]];
  let loreTab = "squad";

  const asList = (value) => (Array.isArray(value) ? value : []);
  const asRow = (value) => (Array.isArray(value) ? value.map((v) => String(v ?? "")) : []);

  function openLore() {
    renderLore();
    show("lore");
  }

  function renderLore() {
    const lore = LORE_DATA;
    $("#lore-source").textContent = lore ? "From the chat" : "";
    $("#lore-sub").textContent = lore && lore.source ? String(lore.source) : "";
    $("#lore-tabs").hidden = !lore;
    $("#lore-tabs").replaceChildren(...LORE_TABS.map(([id, label]) => {
      const chip = el("button", { type: "button", "aria-pressed": String(id === loreTab), text: label });
      chip.addEventListener("click", () => { loreTab = id; renderLore(); });
      return chip;
    }));
    if (!lore) {
      $("#lore-body").replaceChildren(el("p", { class: "small", text: REMOTE
        ? "The lore comes from the group deck. Open the game once with signal and it'll be here, even offline."
        : "No lore here yet. It loads from the group's database once the game is connected to it." }));
      return;
    }
    const render = { squad: loreSquad, cast: loreCast, numbers: loreNumbers, eras: loreEras }[loreTab];
    $("#lore-body").replaceChildren(...render(lore));
  }

  function loreSquad(lore) {
    return asList(lore.squad).map((m, i) => {
      const ink = TEAM_INKS[i % TEAM_INKS.length];
      const name = String(m.name || "");
      const aka = asList(m.aka).map(String);
      return el("details", { class: "dossier" },
        el("summary", {},
          el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: ([...name][0] || "?").toUpperCase() }),
          el("span", { class: "d-name" },
            el("span", { class: "d-title", text: name }),
            aka.length ? el("span", { class: "d-aka", text: aka.join(" · ") }) : null)),
        el("div", { class: "d-body" },
          m.role ? el("p", { class: "d-role", text: String(m.role) }) : null,
          m.pitch ? el("p", { class: "d-pitch" }, el("span", { class: "mini", text: "In 30 seconds" }), el("span", { text: String(m.pitch) })) : null,
          el("ul", { class: "d-stats" }, ...asList(m.stats).map(asRow).map(([k, v]) =>
            el("li", {}, el("span", { class: "mini", text: k }), el("b", { text: v })))),
          asList(m.words).length ? el("p", { class: "d-words" }, ...asList(m.words).map((w) => el("span", { text: String(w) }))) : null,
          el("ul", { class: "d-facts" }, ...asList(m.facts).map((f) => el("li", { text: String(f) })))));
    });
  }

  function loreCast(lore) {
    return [el("ul", { class: "mine-list cast-list" }, ...asList(lore.cast).map(asRow).map(([name, who, known]) =>
      el("li", {},
        el("span", { class: "t", text: name }),
        el("span", { class: "c", text: who }),
        known ? el("span", { class: "q", text: known }) : null)))];
  }

  function loreNumbers(lore) {
    const rule = (cls = "") => el("div", { class: `r-rule ${cls}`, "aria-hidden": "true" });
    const receipt = el("div", { class: "receipt-wrap" },
      el("div", { class: "receipt" },
        el("div", { class: "r-head", text: "WINTON · THE NUMBERS" }),
        lore.source ? el("div", { class: "r-sub", text: String(lore.source) }) : null,
        rule(),
        ...asList(lore.numbers).map(asRow).map(([k, v]) => el("div", { class: "r-line" }, el("span", { text: k }), el("span", { text: v }))),
        rule("double"),
        el("div", { class: "r-sub", text: "Thank you for chatting" })));
    const awards = el("section", { class: "awards" },
      el("h2", { class: "label" }, el("span", { class: "num", text: "★" }), " The awards"),
      el("ul", { class: "award-list" }, ...asList(lore.awards).map(asRow).map(([label, value, badge], i) =>
        el("li", {},
          burst(AWARD_INKS[i % AWARD_INKS.length], badge || "★"),
          el("span", { class: "a-text" }, el("span", { class: "mini", text: label }), el("span", { class: "a-value", text: value }))))));
    return [receipt, awards];
  }

  function loreEras(lore) {
    return [el("ol", { class: "era-list" }, ...asList(lore.eras).map(asRow).map(([when, title, what]) =>
      el("li", {},
        el("span", { class: "mini", text: when }),
        el("span", { class: "e-title", text: title }),
        what ? el("span", { class: "small", text: what }) : null)))];
  }

  $("#lore-back").addEventListener("click", () => show("setup"));

  // ------------------------------------------------------------------ incoming share links

  function checkIncoming() {
    const match = location.hash.match(/^#add=([A-Za-z0-9_-]+)$/);
    if (!match) return false;
    history.replaceState(null, "", location.pathname + location.search);

    const incoming = decodeTerms(match[1]);
    if (!incoming.length) {
      toast("That link didn't have any terms in it.");
      return false;
    }
    const seen = new Set(allTerms().map((t) => dupKey(t.term)));
    pendingImport = incoming.filter((t) => {
      const key = dupKey(t.term);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!pendingImport.length) {
      toast("You already have all of those terms.");
      return false;
    }

    const n = pendingImport.length;
    setPlates($("#import-title"), `${n} new term${n === 1 ? "" : "s"}`);
    const preview = pendingImport.slice(0, 12);
    $("#import-list").replaceChildren(...preview.map((t) =>
      el("li", {}, el("span", { class: "t", text: t.term }), el("span", { class: "c", text: t.category }))));
    $("#import-more").textContent = n > preview.length ? `…and ${n - preview.length} more.` : "";
    $("#import-note").textContent = REMOTE
      ? "Someone sent you terms. They'll go into the group deck for everyone."
      : "Someone sent you terms for the deck. They'll be saved on this phone.";
    show("import");
    return true;
  }

  $("#import-yes").addEventListener("click", async () => {
    $("#import-yes").disabled = true;
    const tried = pendingImport.length;
    const result = await addTerms(pendingImport);
    $("#import-yes").disabled = false;
    pendingImport = [];
    initSetup();
    show("setup");
    toast(addedMessage(result, tried));
  });

  $("#import-no").addEventListener("click", () => {
    pendingImport = [];
    show("setup");
  });

  window.addEventListener("hashchange", () => {
    if (!timerId) checkIncoming();
  });

  // ------------------------------------------------------------------ standings

  function progress(score, target, color) {
    if (target <= 50) {
      const cols = Math.min(target, 25);
      const dots = el("div", { class: "dots", "aria-hidden": "true",
        style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 18}px` } });
      for (let n = 0; n < target; n++) dots.append(el("i", { style: n < score ? { background: color } : {} }));
      return dots;
    }
    return el("div", { class: "bar", "aria-hidden": "true" },
      el("i", { style: { width: `${Math.min(100, (score / target) * 100)}%`, background: color } }));
  }

  function renderStandings(container, highlight) {
    container.replaceChildren(...game.teams.map((t, i) => {
      const ink = TEAM_INKS[t.ink];
      return el("div", { class: "team-row" + (i === highlight ? " current" : "") },
        el("div", { class: "team-head" },
          el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
          el("span", { class: "team-name" }, el("span", { text: t.name })),
          el("span", { class: "team-score", text: String(t.score) }),
          el("span", { class: "team-of", text: `/${game.target}` })),
        progress(t.score, game.target, ink.bg));
    }));
  }

  // ------------------------------------------------------------------ handoff + die

  const currentTeam = () => game.teams[game.current];
  const turnNumber = () => game.history.length + 1;

  function showHandoff() {
    turn = { die: null, card: null };
    $("#turn-no").textContent = `Turn ${pad(turnNumber())}`;
    $("#first-to").textContent = `First to ${game.target}`;
    renderStandings($("#standings"), game.current);
    setPlates($("#team-up"), currentTeam().name);
    renderDie(null);
    $("#die-big").textContent = "Roll";
    $("#die-note").textContent = game.chaos
      ? "Chaos die is on. Some faces change the rules for this turn."
      : "Whatever it lands on comes off this turn's score.";
    $("#roll").hidden = false;
    $("#roll").disabled = false;
    $("#go-wrap").hidden = true;
    show("handoff");
  }

  function renderDie(face, shaking = false) {
    const die = $("#die");
    die.className = "die";
    if (face === null) {
      die.replaceChildren(el("span", { class: "q", text: "?" }));
      die.setAttribute("aria-label", "Die not rolled yet");
      return;
    }
    if (typeof face === "number") {
      const pips = el("span", { class: "pips" });
      for (let i = 0; i < 9; i++) pips.append(el("i", { class: PIPS[face].includes(i) ? "on" : "" }));
      die.replaceChildren(pips);
      die.setAttribute("aria-label", `Die shows ${face}`);
    } else {
      die.classList.add("twist", face);
      die.replaceChildren(el("span", { class: "face" + (face === "double" ? " big" : ""), text: TWISTS[face].face }));
      die.setAttribute("aria-label", `Die shows ${TWISTS[face].big}`);
    }
    die.classList.add(shaking ? "shake" : "landed");
  }

  function describeDie(face) {
    if (typeof face === "number") {
      $("#die-big").textContent = face ? `−${face}` : "0";
      $("#die-note").textContent = ["Lucky. Nothing comes off this turn.",
        "One comes off whatever you score.", "Two come off whatever you score."][face];
    } else {
      $("#die-big").textContent = TWISTS[face].big;
      $("#die-note").textContent = TWISTS[face].note;
    }
  }

  function dieLabel(face) {
    if (typeof face !== "number") return TWISTS[face].big;
    return face ? `Die −${face}` : "Die 0";
  }

  $("#roll").addEventListener("click", () => {
    unlockAudio();
    const faces = game.chaos ? CHAOS_DIE : CLASSIC_DIE;
    const result = faces[rand(faces.length)];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let flips = reduceMotion ? 0 : 8;
    $("#roll").disabled = true;

    const step = () => {
      if (flips-- > 0) {
        renderDie(faces[rand(faces.length)], true);
        beep(300 + Math.random() * 200, 0.03, 0.08);
        return setTimeout(step, 70);
      }
      turn.die = result;
      renderDie(result);
      describeDie(result);
      haptic(30);
      $("#roll").hidden = true;
      $("#go-wrap").hidden = false;
      $("#go").focus();
    };
    step();
  });

  $("#quit").addEventListener("click", () => {
    if (!window.confirm("End this game? The scores will be lost.")) return;
    store.remove(KEYS.game);
    game = null;
    initSetup();
    show("setup");
  });

  // ------------------------------------------------------------------ play

  function gotCount() {
    return turn.card.filter((t) => t.got).length;
  }

  function turnPoints(got, face) {
    if (face === "double") return got * 2;
    if (typeof face === "number") return Math.max(0, got - face);
    return got;
  }

  // Tap toggles a term; a swipe to the right always marks it as got.
  function attachSwipe(node, onSwipe, onTap) {
    const body = node.querySelector(".body");
    let startX = 0, startY = 0, dx = 0;
    let tracking = false, dragging = false, swallowClick = false;

    node.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      tracking = true;
      dragging = false;
      swallowClick = false;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
    });
    node.addEventListener("pointermove", (e) => {
      if (!tracking) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        dragging = true;
        node.classList.add("dragging");
        try { node.setPointerCapture(e.pointerId); } catch {}
      }
      if (dragging) body.style.transform = `translateX(${Math.max(0, Math.min(dx, 140))}px)`;
    });
    const reset = () => {
      node.classList.remove("dragging");
      body.style.transform = "";
    };
    node.addEventListener("pointerup", () => {
      if (!tracking) return;
      tracking = false;
      if (dragging) {
        swallowClick = true;
        reset();
        if (dx > 60) onSwipe();
      }
      dragging = false;
    });
    node.addEventListener("pointercancel", () => {
      tracking = false;
      dragging = false;
      reset();
    });
    node.addEventListener("click", () => {
      if (swallowClick) { swallowClick = false; return; }
      onTap();
    });
  }

  // "Inside Jokes & Lore · ●●●": the dots are the term's difficulty.
  function categoryLabel(item) {
    const r = receiptFor(item.term);
    return r && r.level ? `${item.category} · ${"●".repeat(r.level)}` : item.category;
  }

  function termRow(item, i) {
    const btn = el("button", { type: "button", class: "term", "aria-pressed": String(item.got) },
      el("span", { class: "num", "aria-hidden": "true", text: pad(i + 1) }),
      el("span", { class: "body" },
        el("span", { class: "word", text: item.term }),
        el("span", { class: "cat", text: categoryLabel(item) })),
      svg(ARROW),
      el("span", { class: "stamp", "aria-hidden": "true", text: "GOT IT!" }));

    const set = (value) => {
      if (item.got === value) return;
      item.got = value;
      btn.setAttribute("aria-pressed", String(value));
      if (value) {
        beep(660, 0.08, 0.12);
        haptic(15);
      }
      updatePlayCount(value);
    };
    attachSwipe(btn, () => set(true), () => set(!item.got));
    return el("li", {}, btn);
  }

  $("#go").addEventListener("click", () => {
    unlockAudio();
    turn.card = drawCard();
    turn.from = 0;
    saveGame(); // remember which terms were used, even if the page reloads mid-turn

    $("#play-team").textContent = currentTeam().name;
    $("#play-die").textContent = dieLabel(turn.die);
    const twist = TWISTS[turn.die];
    $("#twist").hidden = !twist;
    $("#twist").textContent = twist ? twist.banner : "";
    renderCard();

    show("play");
    keepScreenOn(true);
    startTimer();
  });

  function renderCard() {
    $("#terms").replaceChildren(...turn.card.slice(turn.from).map(termRow));
    $("#deck-left").textContent = `${game.deck.length} left in the deck`;
    updatePlayCount(false);
  }

  // Once every term on the card is got, the describer can deal another card
  // and keep going on the same clock.
  function updatePlayCount(justGot) {
    const cardNo = turn.from / CARD_SIZE + 1;
    $("#got-count").textContent = gotCount();
    $("#got-of").textContent = turn.card.length;
    $("#card-no").textContent = cardNo > 1 ? `Card ${cardNo} · ` : "";
    const cleared = turn.card.slice(turn.from).every((t) => t.got);
    const wrap = $("#next-card-wrap");
    if (cleared && wrap.hidden && justGot) {
      beep(990, 0.12, 0.15);
      haptic([30, 40, 30]);
    }
    wrap.hidden = !cleared;
  }

  $("#next-card").addEventListener("click", () => {
    if (!timerId) return;
    turn.from = turn.card.length;
    turn.card.push(...drawCard());
    saveGame();
    renderCard();
  });

  function startTimer() {
    const total = game.seconds * 1000;
    const endsAt = Date.now() + total;
    const clock = $("#clock");
    let lastWhole = null;

    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      const whole = Math.ceil(left / 1000);
      if (whole !== lastWhole) {
        setPlates(clock, String(whole));
        $("#clock-sr").textContent = `${whole} seconds left`;
        tabClock(whole, currentTeam().name);
        $("#play").classList.toggle("urgent", whole <= 5);
        if (lastWhole !== null && whole > 0 && whole <= 5) beep(880, 0.06, 0.12);
        lastWhole = whole;
      }
      $("#fuse").style.width = `${(left / total) * 100}%`;
      if (left <= 0) endTurn(true);
    };

    clearInterval(timerId);
    tick();
    timerId = setInterval(tick, 100);
  }

  function endTurn(timeUp) {
    clearInterval(timerId);
    timerId = null;
    keepScreenOn(false);
    $("#play").classList.remove("urgent");
    if (timeUp) {
      beep(440, 0.6, 0.3);
      haptic([200, 100, 200]);
    }
    renderReview(timeUp);
    show("review");
  }

  $("#end-early").addEventListener("click", () => endTurn(false));

  // ------------------------------------------------------------------ review

  function renderReview(timeUp) {
    $("#review-team").textContent = currentTeam().name;
    $("#review-turn").textContent = `Turn ${pad(turnNumber())}`;
    $("#review-title").textContent = timeUp ? "Time's up" : "Turn over";

    $("#review-terms").replaceChildren(...turn.card.map((item) => {
      const status = el("span", { class: "s", text: item.got ? "Got" : "Missed" });
      const why = receiptFor(item.term)?.why;
      const btn = el("button", { type: "button", class: "check", "aria-pressed": String(item.got) },
        el("span", { class: "box" }, svg(TICK)),
        el("span", { class: "tw" },
          el("span", { class: "t", text: item.term }),
          why ? el("span", { class: "why", text: why }) : null),
        status);
      btn.addEventListener("click", () => {
        item.got = !item.got;
        btn.setAttribute("aria-pressed", String(item.got));
        status.textContent = item.got ? "Got" : "Missed";
        renderReceipt();
      });
      return el("li", {}, btn);
    }));
    renderReceipt();
  }

  function renderReceipt() {
    const team = currentTeam();
    const got = gotCount();
    const points = turnPoints(got, turn.die);
    const face = turn.die;
    const dieValue = face === "double" ? "×2" : typeof face === "number" && face > 0 ? `−${face}` : "0";
    const dieName = typeof face === "number" ? "Die" : `Die: ${TWISTS[face].receipt}`;
    const line = (left, right, cls = "") => el("div", { class: "r-line " + cls }, el("span", { text: left }), right);

    $("#receipt").replaceChildren(
      el("div", { class: "r-head", text: "WINTON 30 SECONDS" }),
      el("div", { class: "r-sub", text: `Turn ${pad(turnNumber())} · ${team.name}` }),
      el("div", { class: "r-rule", "aria-hidden": "true" }),
      line("Guessed", el("span", { text: String(got) })),
      line(dieName, el("span", { text: dieValue })),
      el("div", { class: "r-rule double", "aria-hidden": "true" }),
      line("This turn", el("b", { text: `+${points}` }), "r-total"),
      line("New total", el("span", { text: `${team.score + points} / ${game.target}` })));
    $("#confirm-label").textContent = `Bank ${points} point${points === 1 ? "" : "s"}`;
  }

  $("#confirm").addEventListener("click", () => {
    const team = currentTeam();
    const got = gotCount();
    const points = turnPoints(got, turn.die);
    team.score += points;
    game.history.push({
      team: game.current,
      got,
      die: turn.die,
      points,
      missed: turn.card.filter((t) => !t.got).map((t) => t.term),
      seen: turn.card.length,
    });

    if (team.score >= game.target) return showWinner(team);

    game.current = (game.current + 1) % game.teams.length;
    saveGame();
    showHandoff();
  });

  // ------------------------------------------------------------------ winner

  function burst(ink, label) {
    const NS = "http://www.w3.org/2000/svg";
    const root = document.createElementNS(NS, "svg");
    root.setAttribute("width", "44");
    root.setAttribute("height", "44");
    root.setAttribute("viewBox", "0 0 44 44");
    root.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(NS, "polygon");
    shape.setAttribute("points", BURST);
    shape.setAttribute("fill", ink.bg);
    const text = document.createElementNS(NS, "text");
    for (const [k, v] of Object.entries({ x: "22", y: "27", "text-anchor": "middle", "font-family": "Space Mono, monospace",
      "font-weight": "700", "font-size": "13", fill: ink.fg })) text.setAttribute(k, v);
    text.textContent = label;
    root.append(shape, text);
    return root;
  }

  function computeAwards(g = game) {
    const h = g.history;
    const name = (i) => g.teams[i].name;
    const awards = [];

    let best = null;
    h.forEach((t, i) => { if (!best || t.points > best.points) best = { ...t, n: i + 1 }; });
    if (best) awards.push({ label: "Best turn", value: `${name(best.team)}, turn ${best.n} (+${best.points})`, badge: `+${best.points}` });

    const counts = new Map();
    h.flatMap((t) => t.missed).forEach((term) => counts.set(term, (counts.get(term) || 0) + 1));
    if (counts.size) {
      const top = Math.max(...counts.values());
      const worst = [...counts].filter(([, c]) => c === top).map(([term]) => term);
      const term = worst[rand(worst.length)];
      awards.push({ label: "The one nobody got", value: top > 1 ? `${term} (missed ${top} times)` : term, badge: "?" });
    } else {
      awards.push({ label: "Clean sheet", value: "Not one term missed all game", badge: "0" });
    }

    const lost = g.teams.map(() => 0);
    h.forEach((t) => { if (typeof t.die === "number") lost[t.team] += Math.min(t.die, t.got); });
    const unluckiest = lost.indexOf(Math.max(...lost));
    if (lost[unluckiest] > 0) {
      awards.push({ label: "Worst luck with the die", value: `${name(unluckiest)} (lost ${lost[unluckiest]})`, badge: `−${lost[unluckiest]}` });
    } else {
      awards.push({ label: "Lucky dice", value: "Nobody lost a point to the die", badge: "0" });
    }

    const mimes = h.filter((t) => t.die === "mime");
    if (mimes.length) {
      const m = mimes.reduce((a, b) => (b.got > a.got ? b : a));
      awards.push({ label: "Best mime", value: `${name(m.team)} (${m.got} in silence)`, badge: String(m.got) });
    }
    return awards;
  }

  function showWinner(team) {
    store.remove(KEYS.game);
    const h = game.history;
    $("#final-meta").textContent = `${h.length} turns · ${h.reduce((n, t) => n + (t.seen || CARD_SIZE), 0)} terms`;
    setPlates($("#winner-name"), team.name);

    $("#awards").replaceChildren(...computeAwards().map((a, i) =>
      el("li", {},
        burst(AWARD_INKS[i % AWARD_INKS.length], a.badge),
        el("span", { class: "a-text" },
          el("span", { class: "mini", text: a.label }),
          el("span", { class: "a-value", text: a.value })))));

    const ranked = game.teams.slice().sort((a, b) => b.score - a.score);
    $("#final-scores").replaceChildren(...ranked.map((t, i) =>
      el("li", {}, el("span", { text: `${i + 1}. ${t.name}` }), el("span", { text: String(t.score) }))));

    show("winner");
    haptic([60, 40, 60, 40, 120]);
    beep(523, 0.15);
    setTimeout(() => beep(659, 0.15), 150);
    setTimeout(() => beep(784, 0.3), 300);
  }

  $("#rematch").addEventListener("click", () => {
    // Carry on through the same deck so a rematch doesn't repeat terms straight away.
    const { teams, target, seconds, chaos, deck } = game;
    startGame({ names: teams.map((t) => t.name), target, seconds, chaos }, deck);
  });

  $("#new-game").addEventListener("click", () => {
    const { teams, target, seconds, chaos } = game;
    game = null;
    initSetup({ names: teams.map((t) => t.name), target, seconds, chaos });
    show("setup");
  });

  // ------------------------------------------------------------------ the quiz
  //
  // Pass-the-phone trivia about the chat. Each turn a team spins for a
  // category, then answers one question against the clock: 500 for a right
  // answer, up to 500 more for speed, and a streak bonus on top. The last
  // round is worth double. The questions live in the winton_quiz table; QUIZ
  // in words.js holds made-up samples for a phone that has never connected.

  const QUIZ_KINDS = {
    who_said: { wheel: "Who said it", title: "Who said it?" },
    reference: { wheel: "What's the reference", title: "What were they on about?" },
    poll: { wheel: "Polls", title: "The poll" },
    numbers: { wheel: "Numbers", title: "By the numbers" },
    nickname: { wheel: "Nicknames", title: "Nicknames" },
    when: { wheel: "When was it", title: "When was it?" },
    meta: { wheel: "Meta AI", title: "Meta AI" },
  };
  const QUIZ_LIMITS = { rounds: [1, 15], seconds: [10, 60] };
  const SCORE = { right: 500, speed: 500, streakStep: 100, streakMax: 500 };
  // Kahoot's four answer colours and shapes, in riso inks.
  const TILES = [
    { shape: "▲", bg: "#F15060", fg: "#1F2650" },
    { shape: "◆", bg: "#3255A4", fg: "#F3EEE3" },
    { shape: "●", bg: "#FFE800", fg: "#1F2650" },
    { shape: "■", bg: "#006A70", fg: "#F3EEE3" },
  ];

  let QUIZ_BANK = [];          // [{ key, kind, prompt, quote, options, answer, why, level }]
  let quizSource = "starter";  // "starter" | "group"
  let quizSetup = null;        // { names, rounds, seconds }
  let quiz = null;             // { teams, rounds, seconds, round, current, used, history }
  let qturn = null;            // { key, kind, hidden, chosen, ms, points, parts }
  let quizTimer = null;

  function cleanQuestions(rows) {
    const out = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || !QUIZ_KINDS[r.kind] || typeof r.prompt !== "string" || !r.prompt.trim()) continue;
      const options = Array.isArray(r.options) ? r.options.map((o) => String(o ?? "").trim()) : [];
      if (options.length !== 4 || options.some((o) => !o)) continue;
      let answer = options.indexOf(String(r.answer ?? "").trim());
      if (answer < 0 && /^[0-3]$/.test(String(r.answer))) answer = Number(r.answer);
      if (answer < 0) continue;
      out.push({
        key: r.id != null ? `q${r.id}` : `${r.kind}:${r.prompt}:${options[answer]}`,
        kind: r.kind,
        prompt: r.prompt.trim(),
        quote: typeof r.quote === "string" ? r.quote.trim() : "",
        options,
        answer,
        why: typeof r.receipt === "string" ? r.receipt.trim() : "",
        level: clampInt(r.difficulty, 1, 3, 2),
      });
    }
    return out;
  }

  (() => {
    const cached = REMOTE ? store.get(KEYS.quiz, null) : null;
    const group = cleanQuestions(cached && cached.rows);
    if (group.length) {
      QUIZ_BANK = group;
      quizSource = "group";
    } else {
      QUIZ_BANK = cleanQuestions(typeof QUIZ !== "undefined" ? QUIZ : []);
    }
  })();

  let syncingQuiz = null;
  function syncQuiz() {
    if (!REMOTE) return Promise.resolve(false);
    if (syncingQuiz) return syncingQuiz;
    syncingQuiz = (async () => {
      try {
        const rows = await api(`${TABLES.quiz}?select=id,kind,prompt,quote,options,answer,receipt,difficulty&order=id`);
        const bank = cleanQuestions(rows);
        if (!bank.length) return false;
        store.set(KEYS.quiz, { rows, at: Date.now() });
        QUIZ_BANK = bank;
        quizSource = "group";
        if (!$("#quiz-setup").hidden) updateQuizInfo();
        return true;
      } catch {
        return false;
      } finally {
        syncingQuiz = null;
      }
    })();
    return syncingQuiz;
  }

  const findQuestion = (key) => QUIZ_BANK.find((q) => q.key === key);
  const quizTeam = () => quiz.teams[quiz.current];
  const isFinalRound = () => quiz.round === quiz.rounds;

  function saveQuiz() { store.set(KEYS.quizGame, quiz); }

  function loadQuiz() {
    const data = store.get(KEYS.quizGame, null);
    if (!data || !Array.isArray(data.teams) || data.teams.length < 1) return null;
    if (!Array.isArray(data.used)) data.used = [];
    if (!Array.isArray(data.history)) data.history = [];
    data.current = clampInt(data.current, 0, data.teams.length - 1, 0);
    return data;
  }

  // ---- setup

  function openQuiz() {
    const prefs = store.get(KEYS.quizPrefs, {}) || {};
    const gamePrefs = store.get(KEYS.prefs, {}) || {};
    const names = [prefs.names, gamePrefs.names].find((n) => Array.isArray(n) && n.length >= MIN_TEAMS);
    quizSetup = {
      names: (names || ["Team 1", "Team 2"]).slice(0, MAX_TEAMS),
      rounds: clampInt(prefs.rounds, ...QUIZ_LIMITS.rounds, 5),
      seconds: clampInt(prefs.seconds, ...QUIZ_LIMITS.seconds, 20),
    };
    renderQuizTeams();
    renderQuizSettings();
    updateQuizInfo();
    quizError("");
    $("#quiz-resume").hidden = !loadQuiz();
    show("quiz-setup");
    syncQuiz();
  }

  function renderQuizTeams() {
    renderTeamList($("#quiz-team-list"), $("#quiz-add-team"), quizSetup.names, renderQuizTeams);
  }

  function renderQuizSettings() {
    $("#rounds").textContent = quizSetup.rounds;
    $("#qseconds").textContent = quizSetup.seconds;
    for (const btn of document.querySelectorAll("[data-qsetting]")) {
      const key = btn.dataset.qsetting;
      const step = Number(btn.dataset.step);
      btn.disabled = step < 0 ? quizSetup[key] <= QUIZ_LIMITS[key][0] : quizSetup[key] >= QUIZ_LIMITS[key][1];
    }
  }

  function updateQuizInfo() {
    $("#quiz-info").textContent = `${QUIZ_BANK.length} questions · ${quizSource === "group" ? "from the chat" : "samples"}`;
  }

  function quizError(message) {
    $("#quiz-error").textContent = message || "";
    $("#quiz-error").hidden = !message;
  }

  document.querySelectorAll("[data-qsetting]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.qsetting;
      quizSetup[key] = clampInt(quizSetup[key] + Number(btn.dataset.step), ...QUIZ_LIMITS[key], quizSetup[key]);
      renderQuizSettings();
    });
  });

  $("#open-quiz").addEventListener("click", openQuiz);
  $("#quiz-back").addEventListener("click", () => show("setup"));

  $("#quiz-add-team").addEventListener("click", () => {
    quizSetup.names.push(`Team ${quizSetup.names.length + 1}`);
    renderQuizTeams();
    const input = $("#quiz-team-list li:last-child input");
    input.focus();
    input.select();
  });

  $("#quiz-start").addEventListener("click", () => {
    const names = quizSetup.names.map((n, i) => n.trim() || `Team ${i + 1}`);
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return quizError("Give each team a different name.");
    if (QUIZ_BANK.length < names.length) return quizError("Not enough questions loaded yet. Try again with signal.");
    quizError("");
    store.set(KEYS.quizPrefs, { names, rounds: quizSetup.rounds, seconds: quizSetup.seconds });
    unlockAudio();
    startQuiz({ names, rounds: quizSetup.rounds, seconds: quizSetup.seconds });
  });

  $("#quiz-resume").addEventListener("click", () => {
    quiz = loadQuiz();
    if (!quiz) return openQuiz();
    showQuizTurn();
  });

  function startQuiz({ names, rounds, seconds }) {
    quiz = {
      teams: names.map((name, i) => ({
        name, ink: i % TEAM_INKS.length, score: 0, streak: 0, best: 0, right: 0, wrong: 0, fifty: true,
      })),
      rounds,
      seconds,
      round: 1,
      current: 0,
      used: [],
      history: [],
    };
    saveQuiz();
    showQuizTurn();
  }

  // ---- scoreboard

  function renderQuizStandings(container, highlight) {
    const top = Math.max(1, ...quiz.teams.map((t) => t.score));
    container.replaceChildren(...quiz.teams.map((t, i) => {
      const ink = TEAM_INKS[t.ink];
      return el("div", { class: "team-row" + (i === highlight ? " current" : "") },
        el("div", { class: "team-head" },
          el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
          el("span", { class: "team-name" }, el("span", { text: t.name })),
          t.streak > 1 ? el("span", { class: "mini streak", text: `🔥${t.streak}` }) : null,
          el("span", { class: "team-score", text: t.score.toLocaleString("en") })),
        el("div", { class: "bar", "aria-hidden": "true" },
          el("i", { style: { width: `${(t.score / top) * 100}%`, background: ink.bg } })));
    }));
  }

  // ---- the spin

  // Questions this phone has already asked, oldest first, so a new quiz
  // reaches for fresh ones before it repeats.
  function seenKeys() {
    const list = store.get(KEYS.quizSeen, []);
    return Array.isArray(list) ? list : [];
  }

  function markSeen(key) {
    const list = seenKeys().filter((k) => k !== key);
    list.push(key);
    store.set(KEYS.quizSeen, list.slice(-Math.max(50, QUIZ_BANK.length - 10)));
  }

  function openKinds() {
    const used = new Set(quiz.used);
    const kinds = new Set(QUIZ_BANK.filter((q) => !used.has(q.key)).map((q) => q.kind));
    return Object.keys(QUIZ_KINDS).filter((k) => kinds.has(k));
  }

  // Questions get harder as the quiz goes on: easy ones early, deep lore late.
  function pickQuestion(kind) {
    const used = new Set(quiz.used);
    const seen = new Map(seenKeys().map((k, i) => [k, i + 1]));
    const wanted = quiz.rounds < 2 ? 2 : 1 + Math.round((2 * (quiz.round - 1)) / (quiz.rounds - 1));
    const pool = shuffle(QUIZ_BANK.filter((q) => q.kind === kind && !used.has(q.key)));
    pool.sort((a, b) => (seen.get(a.key) || 0) - (seen.get(b.key) || 0)
      || Math.abs(a.level - wanted) - Math.abs(b.level - wanted));
    return pool[0] || null;
  }

  function showQuizTurn() {
    qturn = null;
    const team = quizTeam();
    $("#qt-round").textContent = `Round ${quiz.round} of ${quiz.rounds}`;
    $("#qt-left").textContent = `${QUIZ_BANK.length - quiz.used.length} questions left`;
    renderQuizStandings($("#quiz-standings"), quiz.current);
    setPlates($("#qt-team"), team.name);
    $("#qt-double").hidden = !isFinalRound();
    const kinds = openKinds();
    if (!kinds.length) quiz.used = []; // ran out: let the questions come round again
    renderWheel(openKinds(), null);
    $("#spin").hidden = false;
    $("#spin").disabled = false;
    $("#ask-wrap").hidden = true;
    show("quiz-turn");
  }

  function renderWheel(kinds, lit) {
    $("#wheel").replaceChildren(...kinds.map((k) =>
      el("li", { class: k === lit ? "lit" : "", text: QUIZ_KINDS[k].wheel })));
  }

  $("#spin").addEventListener("click", () => {
    unlockAudio();
    const kinds = openKinds();
    const landed = kinds[rand(kinds.length)];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Tick round the wheel, slowing down, and stop on the chosen category.
    let steps = reduceMotion ? 0 : kinds.length * 2 + kinds.indexOf(landed);
    let at = 0;
    let delay = 50;
    $("#spin").disabled = true;
    const step = () => {
      if (steps-- > 0) {
        renderWheel(kinds, kinds[at++ % kinds.length]);
        beep(500 + (at % 2) * 120, 0.025, 0.07);
        delay *= 1.12;
        return setTimeout(step, delay);
      }
      renderWheel(kinds, landed);
      haptic(30);
      const q = pickQuestion(landed);
      qturn = { key: q.key, kind: landed, hidden: [], chosen: null, ms: 0, points: 0, parts: [] };
      $("#spin").hidden = true;
      $("#ask-wrap").hidden = false;
      $("#ask").focus();
    };
    step();
  });

  $("#quiz-quit").addEventListener("click", () => {
    if (!window.confirm("End this quiz? The scores will be lost.")) return;
    store.remove(KEYS.quizGame);
    quiz = null;
    openQuiz();
  });

  // ---- the question

  function tileButton(q, i, onPick) {
    const tile = TILES[i];
    const btn = el("button", { type: "button", class: "tile", style: { background: tile.bg, color: tile.fg } },
      el("span", { class: "shape", "aria-hidden": "true", text: tile.shape }),
      el("span", { class: "opt", text: q.options[i] }));
    if (onPick) btn.addEventListener("click", () => onPick(i));
    return btn;
  }

  function renderTiles(q) {
    $("#tiles").replaceChildren(...q.options.map((_, i) => {
      const btn = tileButton(q, i, answer);
      if (qturn.hidden.includes(i)) {
        btn.disabled = true;
        btn.classList.add("out");
      }
      return el("li", {}, btn);
    }));
  }

  $("#ask").addEventListener("click", () => {
    const q = findQuestion(qturn.key);
    if (!q) return showQuizTurn();
    quiz.used.push(q.key);
    markSeen(q.key);
    saveQuiz(); // a refresh mid-question spins a fresh one rather than replaying this

    const team = quizTeam();
    $("#qq-team").textContent = team.name;
    $("#qq-kind").textContent = QUIZ_KINDS[q.kind].title;
    $("#qq-prompt").textContent = q.prompt;
    $("#qq-quote").hidden = !q.quote;
    $("#qq-quote").textContent = q.quote ? `“${q.quote}”` : "";
    $("#qq-worth").textContent = isFinalRound() ? "Double points" : "";
    $("#qq-streak").textContent = team.streak ? `Streak ${team.streak} 🔥` : "";
    $("#fifty").hidden = !team.fifty;
    $("#fifty").disabled = false;
    renderTiles(q);
    show("quiz-q");
    keepScreenOn(true);
    startQuizTimer();
  });

  $("#fifty").addEventListener("click", () => {
    const q = findQuestion(qturn.key);
    const team = quizTeam();
    if (!q || !team.fifty || qturn.chosen !== null) return;
    team.fifty = false;
    const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== q.answer));
    qturn.hidden = wrong.slice(0, 2);
    qturn.usedFifty = true;
    $("#fifty").disabled = true;
    haptic(20);
    renderTiles(q);
  });

  function startQuizTimer() {
    const total = quiz.seconds * 1000;
    const startedAt = Date.now();
    const clock = $("#q-clock");
    let lastWhole = null;
    qturn.total = total;
    qturn.startedAt = startedAt;

    const tick = () => {
      const left = Math.max(0, total - (Date.now() - startedAt));
      const whole = Math.ceil(left / 1000);
      if (whole !== lastWhole) {
        setPlates(clock, String(whole));
        $("#q-clock-sr").textContent = `${whole} seconds left`;
        tabClock(whole, quizTeam().name);
        $("#quiz-q").classList.toggle("urgent", whole <= 5);
        if (lastWhole !== null && whole > 0 && whole <= 5) beep(880, 0.06, 0.12);
        lastWhole = whole;
      }
      $("#q-fuse").style.width = `${(left / total) * 100}%`;
      if (left <= 0) answer(null);
    };
    clearInterval(quizTimer);
    tick();
    quizTimer = setInterval(tick, 100);
  }

  function stopQuizTimer() {
    clearInterval(quizTimer);
    quizTimer = null;
    keepScreenOn(false);
    $("#quiz-q").classList.remove("urgent");
  }

  // Kahoot-style: 500 for being right, up to 500 more for speed, then the
  // streak bonus, and the whole lot doubles in the final round.
  function scoreAnswer(team, correct, ms) {
    if (!correct) return { points: 0, parts: [] };
    const speed = Math.round(SCORE.speed * Math.max(0, 1 - ms / (quiz.seconds * 1000)));
    const streak = Math.min(SCORE.streakMax, SCORE.streakStep * (team.streak - 1));
    const parts = [["Right answer", SCORE.right], [`Speed (${(ms / 1000).toFixed(1)}s)`, speed]];
    if (streak > 0) parts.push([`Streak ×${team.streak}`, streak]);
    let points = SCORE.right + speed + streak;
    if (isFinalRound()) {
      parts.push(["Final round", "×2"]);
      points *= 2;
    }
    return { points, parts };
  }

  function answer(choice) {
    if (!qturn || qturn.chosen !== null || !quizTimer) return;
    const ms = Math.min(qturn.total, Date.now() - qturn.startedAt);
    stopQuizTimer();
    const q = findQuestion(qturn.key);
    const team = quizTeam();
    const correct = choice === q.answer;
    qturn.chosen = choice === null ? -1 : choice;
    qturn.ms = ms;
    qturn.lostStreak = correct ? 0 : team.streak;

    if (correct) {
      team.right++;
      team.streak++;
      team.best = Math.max(team.best, team.streak);
    } else {
      team.wrong++;
      team.streak = 0;
    }
    const { points, parts } = scoreAnswer(team, correct, ms);
    team.score += points;
    qturn.points = points;
    qturn.parts = parts;
    quiz.history.push({ team: quiz.current, round: quiz.round, key: q.key, kind: q.kind, correct, timeUp: choice === null, ms, points });
    saveQuiz();

    if (correct) {
      beep(660, 0.1, 0.15);
      setTimeout(() => beep(990, 0.18, 0.15), 110);
      haptic(30);
    } else {
      beep(200, 0.4, 0.2);
      haptic([120, 60, 120]);
    }
    renderReveal(q, correct, choice === null);
    show("quiz-reveal");
  }

  // ---- the reveal

  function renderReveal(q, correct, timeUp) {
    const team = quizTeam();
    $("#qr-team").textContent = team.name;
    $("#qr-round").textContent = `Round ${quiz.round} of ${quiz.rounds}`;
    $("#qr-title").textContent = correct ? "Correct" : timeUp ? "Time's up" : "Wrong";
    $("#qr-title").classList.toggle("wrong", !correct);
    $("#qr-prompt").textContent = q.quote ? `${q.prompt} “${q.quote}”` : q.prompt;
    $("#qr-tiles").replaceChildren(...q.options.map((_, i) => {
      const btn = tileButton(q, i, null);
      btn.disabled = true;
      if (i === q.answer) btn.classList.add("right");
      else btn.classList.add("out");
      if (i === qturn.chosen) btn.append(el("span", { class: "pick mini", text: i === q.answer ? "Your answer ✓" : "Your answer" }));
      return el("li", {}, btn);
    }));

    const line = (left, right, cls = "") => el("div", { class: "r-line " + cls }, el("span", { text: left }), right);
    const rule = (cls = "") => el("div", { class: `r-rule ${cls}`, "aria-hidden": "true" });
    $("#q-receipt").replaceChildren(...[
      el("div", { class: "r-head", text: "WINTON · THE QUIZ" }),
      el("div", { class: "r-sub", text: `Round ${quiz.round} · ${team.name}` }),
      rule(),
      el("div", { class: "r-answer" }, el("span", { class: "mini", text: "The answer" }), el("b", { text: q.options[q.answer] })),
      q.why ? el("p", { class: "r-why", text: q.why }) : null,
      rule(),
      ...(correct
        ? qturn.parts.map(([k, v]) => line(k, el("span", { text: typeof v === "number" ? `+${v}` : v })))
        : [line(timeUp ? "Too slow" : "Wrong answer", el("span", { text: "0" })),
          qturn.lostStreak ? line(`Streak of ${qturn.lostStreak}`, el("span", { text: "lost" })) : null]),
      rule("double"),
      line("This question", el("b", { text: `+${qturn.points.toLocaleString("en")}` }), "r-total"),
      line("New total", el("span", { text: team.score.toLocaleString("en") })),
    ].filter(Boolean));

    renderQuizStandings($("#qr-standings"), quiz.current);
    const last = quiz.current === quiz.teams.length - 1;
    $("#q-next-label").textContent = last && isFinalRound() ? "See the podium"
      : last ? `On to round ${quiz.round + 1}` : "Next team";
  }

  $("#q-next").addEventListener("click", () => {
    if (quiz.current === quiz.teams.length - 1) {
      if (isFinalRound()) return showPodium();
      quiz.round++;
    }
    quiz.current = (quiz.current + 1) % quiz.teams.length;
    saveQuiz();
    showQuizTurn();
  });

  // ---- the podium

  function quizAwards() {
    const h = quiz.history;
    const name = (i) => quiz.teams[i].name;
    const awards = [];

    const fastest = h.filter((t) => t.correct).sort((a, b) => a.ms - b.ms)[0];
    if (fastest) awards.push({ label: "Fastest finger", value: `${name(fastest.team)} (${(fastest.ms / 1000).toFixed(1)}s)`, badge: "⚡" });

    const streaker = quiz.teams.reduce((a, b) => (b.best > a.best ? b : a));
    if (streaker.best > 1) awards.push({ label: "Hot streak", value: `${streaker.name} (${streaker.best} in a row)`, badge: String(streaker.best) });

    const biggest = h.slice().sort((a, b) => b.points - a.points)[0];
    if (biggest && biggest.points) awards.push({ label: "Biggest answer", value: `${name(biggest.team)}, round ${biggest.round}`, badge: `+${Math.round(biggest.points / 100) / 10}k` });

    const lost = quiz.teams.slice().sort((a, b) => b.wrong - a.wrong)[0];
    if (lost && lost.wrong) awards.push({ label: "Do you even read the chat?", value: `${lost.name} (${lost.wrong} wrong)`, badge: "?" });

    const byKind = {};
    for (const t of h) {
      const k = (byKind[t.kind] ||= { right: 0, all: 0 });
      k.all++;
      if (t.correct) k.right++;
    }
    const hardest = Object.entries(byKind).filter(([, v]) => v.all > 1).sort((a, b) => a[1].right / a[1].all - b[1].right / b[1].all)[0];
    if (hardest && hardest[1].right < hardest[1].all) {
      awards.push({ label: "The category nobody knows", value: `${QUIZ_KINDS[hardest[0]].wheel} (${hardest[1].right} of ${hardest[1].all})`, badge: "✗" });
    }

    const brave = quiz.teams.filter((t) => t.fifty);
    if (brave.length && brave.length < quiz.teams.length) {
      awards.push({ label: "Never needed the 50:50", value: brave.map((t) => t.name).join(", "), badge: "50" });
    }
    return awards;
  }

  function showPodium() {
    store.remove(KEYS.quizGame);
    const ranked = quiz.teams.slice().sort((a, b) => b.score - a.score || b.right - a.right);
    const top = ranked[0];
    const tied = ranked.filter((t) => t.score === top.score);
    $("#qe-meta").textContent = `${quiz.rounds} round${quiz.rounds === 1 ? "" : "s"} · ${quiz.history.length} questions`;
    setPlates($("#qe-winner"), tied.length > 1 ? tied.map((t) => t.name).join(" & ") : top.name);

    // Second, first, third: the classic podium shape.
    const places = [[1, "2nd"], [0, "1st"], [2, "3rd"]].filter(([i]) => ranked[i]);
    $("#podium").replaceChildren(...places.map(([i, label]) => {
      const t = ranked[i];
      const ink = TEAM_INKS[t.ink];
      return el("li", { class: `step p${i + 1}` },
        el("span", { class: "p-name", text: t.name }),
        el("span", { class: "p-score", text: t.score.toLocaleString("en") }),
        el("span", { class: "p-block", style: { background: ink.bg, color: ink.fg } }, el("span", { text: label })));
    }));

    $("#q-awards").replaceChildren(...quizAwards().map((a, i) =>
      el("li", {},
        burst(AWARD_INKS[i % AWARD_INKS.length], a.badge),
        el("span", { class: "a-text" },
          el("span", { class: "mini", text: a.label }),
          el("span", { class: "a-value", text: a.value })))));

    $("#q-final").replaceChildren(...ranked.map((t, i) =>
      el("li", {}, el("span", { text: `${i + 1}. ${t.name} · ${t.right}/${t.right + t.wrong} right` }), el("span", { text: t.score.toLocaleString("en") }))));

    show("quiz-end");
    haptic([60, 40, 60, 40, 120]);
    beep(523, 0.15);
    setTimeout(() => beep(659, 0.15), 150);
    setTimeout(() => beep(784, 0.3), 300);
  }

  $("#q-rematch").addEventListener("click", () => {
    const { teams, rounds, seconds } = quiz;
    startQuiz({ names: teams.map((t) => t.name), rounds, seconds });
  });

  $("#q-home").addEventListener("click", () => {
    quiz = null;
    initSetup();
    show("setup");
  });

  // Don't lose a turn to an accidental refresh or back-swipe.
  window.addEventListener("beforeunload", (e) => {
    if (timerId || quizTimer) e.preventDefault();
  });

  // What online.js needs from the game.
  window.W30 = {
    $, el, svg, show, toast, setPlates, beep, haptic, unlockAudio, keepScreenOn, store, shuffle, rand, pad,
    clampInt, termKey, dupKey, allTerms, dealCard, receiptFor, categoryLabel, attachSwipe, burst, computeAwards,
    tabClock, syncDeck, syncQuiz, quizBank: () => QUIZ_BANK, remote: () => REMOTE,
    CARD_SIZE, TEAM_INKS, AWARD_INKS, LETTERS, TWISTS, PIPS, CLASSIC_DIE, CHAOS_DIE, QUIZ_KINDS, TILES, SCORE,
    ARROW, TICK, TAB, MIN_TEAMS, MAX_TEAMS,
  };

  makeGrain();
  initSetup();
  if (!checkIncoming()) show("setup");
  // Inside a Discord Activity, discord-boot.js first routes Supabase through
  // Discord's proxy; everywhere else WINTON_BOOT is already settled.
  Promise.resolve(window.WINTON_BOOT).catch(() => {}).then(() => {
    syncDeck();
    syncQuiz();
  });
})();
