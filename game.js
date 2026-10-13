(() => {
  "use strict";

  const DIE_FACES = [0, 0, 1, 1, 2, 2]; // same as the board game's die
  const CARD_SIZE = 5;
  const MIN_TEAMS = 2;
  const MAX_TEAMS = 6;
  const SAVE_KEY = "winton30.game";

  const $ = (sel) => document.querySelector(sel);
  const SCREENS = ["setup", "handoff", "play", "review", "winner"];

  let game = null; // { teams: [{name, score}], target, seconds, current, deck }
  let turn = null; // { die, card: [{term, category, got}] }
  let timerId = null;
  let wakeLock = null;

  function show(name) {
    for (const id of SCREENS) $("#" + id).hidden = id !== name;
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- deck

  function loadTerms() {
    const words = typeof WORDS === "object" && WORDS ? WORDS : {};
    const seen = new Set();
    const terms = [];
    for (const [category, list] of Object.entries(words)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const term = String(raw).trim();
        const key = term.toLowerCase();
        if (!term || seen.has(key)) continue;
        seen.add(key);
        terms.push({ term, category });
      }
    }
    return terms;
  }

  const ALL_TERMS = loadTerms();

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function drawCard() {
    // Reshuffle the whole deck once there aren't enough terms left for a card.
    if (game.deck.length < CARD_SIZE) game.deck = shuffle(ALL_TERMS.slice());
    return game.deck.splice(0, CARD_SIZE).map((t) => ({ ...t, got: false }));
  }

  // ---------------------------------------------------------------- saving

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch {}
  }

  function loadSaved() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (data && Array.isArray(data.teams) && data.teams.length >= MIN_TEAMS) return data;
    } catch {}
    return null;
  }

  function clearSaved() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
  }

  // ---------------------------------------------------------------- sound

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

  async function keepScreenOn(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  // ---------------------------------------------------------------- setup

  const teamList = $("#team-list");

  function renderTeamInputs(names) {
    teamList.replaceChildren(...names.map((name, i) => {
      const li = document.createElement("li");
      const input = document.createElement("input");
      input.type = "text";
      input.value = name;
      input.maxLength = 30;
      input.setAttribute("aria-label", `Team ${i + 1} name`);
      li.append(input);
      if (names.length > MIN_TEAMS) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove team ${i + 1}`);
        remove.addEventListener("click", () => {
          const current = currentTeamNames();
          current.splice(i, 1);
          renderTeamInputs(current);
        });
        li.append(remove);
      }
      return li;
    }));
    $("#add-team").hidden = names.length >= MAX_TEAMS;
  }

  function currentTeamNames() {
    return [...teamList.querySelectorAll("input")].map((el) => el.value);
  }

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function setupError(message) {
    const el = $("#setup-error");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function startGame(teamNames, target, seconds, deck = shuffle(ALL_TERMS.slice())) {
    game = {
      teams: teamNames.map((name) => ({ name, score: 0 })),
      target,
      seconds,
      current: 0,
      deck,
    };
    save();
    showHandoff();
  }

  function initSetup() {
    const categories = new Set(ALL_TERMS.map((t) => t.category)).size;
    $("#deck-info").textContent =
      `${ALL_TERMS.length} terms across ${categories} categor${categories === 1 ? "y" : "ies"}`;

    const saved = loadSaved();
    renderTeamInputs(saved ? saved.teams.map((t) => t.name) : ["Team 1", "Team 2"]);
    if (saved) {
      $("#target").value = saved.target;
      $("#seconds").value = saved.seconds;
    }
    $("#resume").hidden = !saved;

    if (ALL_TERMS.length < CARD_SIZE) {
      setupError(`Add at least ${CARD_SIZE} terms to words.js to play.`);
      $("#start-game").disabled = true;
    }
  }

  $("#add-team").addEventListener("click", () => {
    const names = currentTeamNames();
    names.push(`Team ${names.length + 1}`);
    renderTeamInputs(names);
    teamList.querySelector("li:last-child input").focus();
  });

  $("#start-game").addEventListener("click", () => {
    const names = currentTeamNames().map((n, i) => n.trim() || `Team ${i + 1}`);
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size !== lower.length) return setupError("Give each team a different name.");
    setupError("");
    const target = clampInt($("#target").value, 5, 200, 25);
    const seconds = clampInt($("#seconds").value, 10, 120, 30);
    startGame(names, target, seconds);
  });

  $("#resume").addEventListener("click", () => {
    game = loadSaved();
    if (!game) return initSetup();
    if (!Array.isArray(game.deck)) game.deck = shuffle(ALL_TERMS.slice());
    showHandoff();
  });

  // ---------------------------------------------------------------- scoreboard

  function renderScores(listEl, highlightIndex) {
    const order = game.teams
      .map((team, i) => ({ ...team, i }))
      .sort((a, b) => (highlightIndex === undefined ? b.score - a.score : a.i - b.i));
    listEl.replaceChildren(...order.map((team) => {
      const li = document.createElement("li");
      if (team.i === highlightIndex) li.className = "current";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = team.name;
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = `${team.score} / ${game.target}`;
      const track = document.createElement("div");
      track.className = "track";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = `${Math.min(100, (team.score / game.target) * 100)}%`;
      track.append(fill);
      li.append(name, score, track);
      return li;
    }));
  }

  // ---------------------------------------------------------------- handoff

  function showHandoff() {
    turn = { die: null, card: null };
    renderScores($("#scoreboard"), game.current);
    $("#team-up").textContent = game.teams[game.current].name;

    const die = $("#die");
    die.textContent = "?";
    die.className = "die";
    die.setAttribute("aria-label", "Die not rolled yet");
    $("#die-note").textContent = "Roll the die. Whatever it lands on comes off this turn's score.";
    $("#roll").hidden = false;
    $("#roll").disabled = false;
    $("#go").hidden = true;
    show("handoff");
  }

  $("#roll").addEventListener("click", () => {
    unlockAudio();
    const die = $("#die");
    const roll = DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("#roll").disabled = true;
    die.classList.add("rolling");

    let flips = reduceMotion ? 0 : 8;
    const flip = () => {
      if (flips-- > 0) {
        die.textContent = DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)];
        beep(300 + Math.random() * 200, 0.03, 0.08);
        return setTimeout(flip, 70);
      }
      turn.die = roll;
      die.textContent = roll;
      die.className = "die landed";
      die.setAttribute("aria-label", `Die rolled ${roll}`);
      $("#die-note").textContent = roll === 0
        ? "Lucky! Nothing comes off this turn."
        : `${roll} comes off whatever you score this turn.`;
      $("#roll").hidden = true;
      $("#go").hidden = false;
      $("#go").focus();
    };
    flip();
  });

  $("#quit").addEventListener("click", () => {
    if (!confirm("End this game? The scores will be lost.")) return;
    clearSaved();
    game = null;
    initSetup();
    show("setup");
  });

  // ---------------------------------------------------------------- play

  function termButton(item, onToggle) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "term";
    btn.setAttribute("aria-pressed", String(item.got));

    const check = document.createElement("span");
    check.className = "check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";

    const label = document.createElement("span");
    label.className = "label";
    const word = document.createElement("span");
    word.className = "word";
    word.textContent = item.term;
    const category = document.createElement("span");
    category.className = "category";
    category.textContent = item.category;
    label.append(word, category);

    btn.append(check, label);
    btn.addEventListener("click", () => {
      item.got = !item.got;
      btn.setAttribute("aria-pressed", String(item.got));
      if (item.got) beep(660, 0.08, 0.12);
      onToggle();
    });
    li.append(btn);
    return li;
  }

  function gotCount() {
    return turn.card.filter((t) => t.got).length;
  }

  $("#go").addEventListener("click", () => {
    unlockAudio();
    turn.card = drawCard();
    save(); // remember which terms have been used, even if the page reloads mid-turn

    const updateCount = () => { $("#got-count").textContent = gotCount(); };
    $("#terms").replaceChildren(...turn.card.map((item) => termButton(item, updateCount)));
    updateCount();

    show("play");
    keepScreenOn(true);
    startTimer();
  });

  function startTimer() {
    const total = game.seconds * 1000;
    const endsAt = Date.now() + total;
    let lastWhole = null;

    const tick = () => {
      const left = Math.max(0, endsAt - Date.now());
      const whole = Math.ceil(left / 1000);
      $("#timer").textContent = whole;
      $("#timer-bar").style.transform = `scaleX(${left / total})`;
      $("#play").classList.toggle("urgent", whole <= 5);
      if (lastWhole !== null && whole !== lastWhole && whole > 0 && whole <= 5) beep(880, 0.06, 0.12);
      lastWhole = whole;
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
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }

    $("#review-title").textContent = timeUp ? "Time's up!" : "Turn over";
    const updateTally = () => {
      const got = gotCount();
      $("#tally-got").textContent = got;
      $("#tally-die").textContent = turn.die ? `−${turn.die}` : "0";
      $("#tally-points").textContent = Math.max(0, got - turn.die);
    };
    $("#review-terms").replaceChildren(...turn.card.map((item) => termButton(item, updateTally)));
    updateTally();
    show("review");
  }

  $("#end-early").addEventListener("click", () => endTurn(false));

  // ---------------------------------------------------------------- scoring

  $("#confirm").addEventListener("click", () => {
    const team = game.teams[game.current];
    team.score += Math.max(0, gotCount() - turn.die);

    if (team.score >= game.target) {
      clearSaved();
      $("#winner-name").textContent = team.name;
      renderScores($("#final-scores"));
      show("winner");
      beep(523, 0.15); setTimeout(() => beep(659, 0.15), 150); setTimeout(() => beep(784, 0.3), 300);
      return;
    }

    game.current = (game.current + 1) % game.teams.length;
    save();
    showHandoff();
  });

  $("#rematch").addEventListener("click", () => {
    // Carry on through the same deck so a rematch doesn't repeat terms straight away.
    startGame(game.teams.map((t) => t.name), game.target, game.seconds, game.deck);
  });

  $("#new-game").addEventListener("click", () => {
    const { teams, target, seconds } = game;
    game = null;
    initSetup();
    renderTeamInputs(teams.map((t) => t.name));
    $("#target").value = target;
    $("#seconds").value = seconds;
    show("setup");
  });

  // Don't lose a game in progress to an accidental refresh or back-swipe.
  window.addEventListener("beforeunload", (e) => {
    if (timerId) e.preventDefault();
  });

  initSetup();
})();
