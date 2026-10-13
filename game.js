(() => {
  "use strict";

  const CARD_SIZE = 5;
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 6;
  const LETTERS = "ABCDEF";
  const KEYS = { game: "winton30.game", custom: "winton30.custom", prefs: "winton30.prefs", remote: "winton30.remote" };
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
  const SCREENS = ["setup", "deck", "lore", "import", "handoff", "play", "review", "winner"];

  let setup = null;  // { names, target, seconds, chaos, afterDark }
  let game = null;   // { teams, target, seconds, chaos, afterDark, current, deck, history }
  let turn = null;   // { die, card: [{ term, category, got }] }
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

  function show(name) {
    for (const id of SCREENS) {
      const screen = $("#" + id);
      screen.hidden = id !== name;
      screen.classList.toggle("feed", id === name);
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

  const AFTER_DARK_CATEGORY = "After dark";
  const TABLES = { terms: "winton_terms", lore: "winton_lore" };
  const REMOTE = typeof SUPABASE === "object" && SUPABASE && SUPABASE.url && SUPABASE.key
    ? { url: String(SUPABASE.url).replace(/\/+$/, ""), key: String(SUPABASE.key) }
    : null;

  let BASE_TERMS = [];        // [{ term, category, spicy, level, why }]
  let RECEIPT_MAP = new Map(); // termKey -> term with a difficulty or a receipt
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
    const spicy = typeof AFTER_DARK !== "undefined" && Array.isArray(AFTER_DARK) ? AFTER_DARK : [];
    for (const raw of spicy) list.push({ term: String(raw).trim(), category: AFTER_DARK_CATEGORY, spicy: true });
    return list;
  }

  function fromRows(rows) {
    return rows
      .filter((r) => r && typeof r.term === "string" && r.term.trim())
      .map((r) => ({
        term: r.term.trim(),
        category: r.after_dark ? AFTER_DARK_CATEGORY : String(r.category || "Added").trim() || "Added",
        spicy: !!r.after_dark,
        level: clampInt(r.difficulty, 1, 3, 0),
        why: typeof r.receipt === "string" ? r.receipt.trim() : "",
      }));
  }

  function useDeck(terms, lore, rows, source) {
    BASE_TERMS = terms;
    LORE_DATA = lore && typeof lore === "object" ? lore : null;
    groupRows = Array.isArray(rows) ? rows : [];
    deckSource = source;
    RECEIPT_MAP = new Map(terms.filter((t) => t.level || t.why).map((t) => [termKey(t.term), t]));
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
  const hasAfterDark = () => BASE_TERMS.some((t) => t.spicy);

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
          api(`${TABLES.terms}?select=term,category,difficulty,receipt,after_dark,source,created_at&order=id`),
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

  // After-dark terms only join the deck when that house rule is on.
  function allTerms(withAfterDark = false) {
    const seen = new Set();
    const out = [];
    for (const t of [...BASE_TERMS, ...customTerms()]) {
      if (t.spicy && !withAfterDark) continue;
      const key = termKey(t.term);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ term: t.term.trim(), category: t.category || "Added" });
    }
    return out;
  }

  function categoryList() {
    const cats = [];
    for (const t of [...BASE_TERMS, ...customTerms()]) {
      if (t.spicy) continue;
      if (t.category && !cats.includes(t.category)) cats.push(t.category);
    }
    return cats.length ? cats : ["Added"];
  }

  function cleanNew(list) {
    const existing = new Set(allTerms(true).map((t) => termKey(t.term)));
    const out = [];
    for (const t of list) {
      const term = String(t.term || "").trim().slice(0, 80);
      const key = termKey(term);
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
    const enough = allTerms(setup.afterDark).length >= CARD_SIZE;
    $("#start-game").disabled = !enough;
    if (enough && $("#setup-error").textContent === DECK_SHORT) setupError("");
    $("#open-lore").hidden = !LORE_DATA && !REMOTE;
    if (!$("#deck").hidden) renderDeck();
    if (!$("#lore").hidden) renderLore();
  }

  function drawCard() {
    if (game.deck.length < CARD_SIZE) game.deck = shuffle(allTerms(game.afterDark));
    return game.deck.splice(0, CARD_SIZE).map((t) => ({ ...t, got: false }));
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
    data.afterDark = !!data.afterDark;
    if (!Array.isArray(data.deck)) data.deck = shuffle(allTerms(data.afterDark));
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
      afterDark: !!(prefill?.afterDark ?? prefs.afterDark),
    };
    renderTeamInputs();
    renderSettings();
    updateDeckInfo();
    $("#resume").hidden = !loadSaved();
    $("#open-lore").hidden = !LORE_DATA && !REMOTE;

    const enough = allTerms(setup.afterDark).length >= CARD_SIZE;
    $("#start-game").disabled = !enough;
    setupError(enough ? "" : DECK_SHORT);
  }

  const DECK_SHORT = `Add at least ${CARD_SIZE} terms to the deck to play.`;

  function updateDeckInfo() {
    const total = allTerms(setup?.afterDark).length;
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
    $("#team-list").replaceChildren(...setup.names.map((name, i) => {
      const ink = TEAM_INKS[i % TEAM_INKS.length];
      const input = el("input", { type: "text", maxlength: "30", autocomplete: "off", enterkeyhint: "next" });
      input.value = name;
      input.addEventListener("input", () => { setup.names[i] = input.value; });
      const label = el("label", {}, el("span", { class: "sr-only", text: `Team ${LETTERS[i]} name` }), input);
      const li = el("li", {},
        el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] }),
        label);
      if (setup.names.length > MIN_TEAMS) {
        const remove = el("button", { type: "button", class: "remove", "aria-label": `Remove team ${LETTERS[i]}`, text: "×" });
        remove.addEventListener("click", () => {
          setup.names.splice(i, 1);
          renderTeamInputs();
        });
        li.append(remove);
      }
      return li;
    }));
    $("#add-team").hidden = setup.names.length >= MAX_TEAMS;
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
    const spicy = BASE_TERMS.filter((t) => t.spicy).length;
    $("#after-dark-row").hidden = !spicy;
    $("#after-dark").setAttribute("aria-checked", String(setup.afterDark));
    $("#after-dark-note").textContent = `Adds ${spicy} cruder term${spicy === 1 ? "" : "s"} to the deck`;
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

  $("#after-dark").addEventListener("click", () => {
    setup.afterDark = !setup.afterDark;
    renderSettings();
    updateDeckInfo();
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
    store.set(KEYS.prefs, { names, target: setup.target, seconds: setup.seconds, chaos: setup.chaos, afterDark: setup.afterDark });
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

  function startGame({ names, target, seconds, chaos, afterDark }, deck) {
    game = {
      teams: names.map((name, i) => ({ name, score: 0, ink: i % TEAM_INKS.length })),
      target,
      seconds,
      chaos,
      afterDark: !!afterDark,
      current: 0,
      deck: deck && deck.length >= CARD_SIZE ? deck : shuffle(allTerms(afterDark)),
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
    button.disabled = true;
    const result = await addTerms([{ term, category: pickedCat }]);
    button.disabled = false;
    if (result.added) {
      haptic(15);
      input.value = "";
      if (REMOTE && !result.shared) toast("No signal. Saved on this phone for now.");
    } else {
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
    const enough = allTerms(setup.afterDark).length >= CARD_SIZE;
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
    const seen = new Set(allTerms(true).map((t) => termKey(t.term)));
    pendingImport = incoming.filter((t) => {
      const key = termKey(t.term);
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
      $("#got-count").textContent = gotCount();
      if (value) {
        beep(660, 0.08, 0.12);
        haptic(15);
      }
    };
    attachSwipe(btn, () => set(true), () => set(!item.got));
    return el("li", {}, btn);
  }

  $("#go").addEventListener("click", () => {
    unlockAudio();
    turn.card = drawCard();
    saveGame(); // remember which terms were used, even if the page reloads mid-turn

    $("#play-team").textContent = currentTeam().name;
    $("#play-die").textContent = dieLabel(turn.die);
    const twist = TWISTS[turn.die];
    $("#twist").hidden = !twist;
    $("#twist").textContent = twist ? twist.banner : "";
    $("#terms").replaceChildren(...turn.card.map(termRow));
    $("#got-count").textContent = "0";
    $("#deck-left").textContent = `${game.deck.length} left in the deck`;

    show("play");
    keepScreenOn(true);
    startTimer();
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

  function computeAwards() {
    const h = game.history;
    const name = (i) => game.teams[i].name;
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

    const lost = game.teams.map(() => 0);
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
      awards.push({ label: "Best mime", value: `${name(m.team)} (${m.got} of 5 in silence)`, badge: String(m.got) });
    }
    return awards;
  }

  function showWinner(team) {
    store.remove(KEYS.game);
    const h = game.history;
    $("#final-meta").textContent = `${h.length} turns · ${h.length * CARD_SIZE} terms`;
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
    const { teams, target, seconds, chaos, afterDark, deck } = game;
    startGame({ names: teams.map((t) => t.name), target, seconds, chaos, afterDark }, deck);
  });

  $("#new-game").addEventListener("click", () => {
    const { teams, target, seconds, chaos, afterDark } = game;
    game = null;
    initSetup({ names: teams.map((t) => t.name), target, seconds, chaos, afterDark });
    show("setup");
  });

  // Don't lose a turn to an accidental refresh or back-swipe.
  window.addEventListener("beforeunload", (e) => {
    if (timerId) e.preventDefault();
  });

  makeGrain();
  initSetup();
  if (!checkIncoming()) show("setup");
  syncDeck();
})();
