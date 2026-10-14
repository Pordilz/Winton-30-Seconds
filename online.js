// =====================================================================
//  Online play: everyone on their own phone or PC, in the same room.
// =====================================================================
//
//  One device hosts the room and runs the game. It can be a player, or a
//  "big screen" that someone streams on a Discord call. Every other device
//  is a controller that sends what its player does and shows what that
//  player may see: the describer gets the card, everyone else gets the
//  clock, the scores and the reveal.
//
//  Devices talk over a Supabase Realtime channel named after the room
//  code. Inside a Discord Activity the room comes from the Activity, so
//  everyone in the voice channel lands in the same game.
//
//  The host is whoever has been in the room longest. If the host drops
//  out, the next device takes over from the last state it saw, and if the
//  host comes back it carries on from wherever the room has got to.
// =====================================================================

(() => {
  "use strict";
  const W = window.W30;
  if (!W) return;
  const {
    $, el, show, toast, setPlates, beep, haptic, unlockAudio, keepScreenOn, store, shuffle, rand, clampInt,
    dealCard, receiptFor, attachSwipe, burst, computeAwards, termKey, pickKind, spinTicks,
    CARD_SIZE, TEAM_INKS, AWARD_INKS, LETTERS, TWISTS, PIPS, CLASSIC_DIE, CHAOS_DIE, QUIZ_KINDS, TILES, SCORE, TAB,
  } = W;

  const NAME_KEY = "winton30.netname";
  const SESSION_KEY = "winton30.net";
  const ROOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const LIMITS = { target: [5, 100], seconds: [10, 90], teams: [2, 4], rounds: [3, 30], qseconds: [10, 60] };
  const HEARTBEAT = 3000;
  const params = new URLSearchParams(location.search);
  const useLocalNet = params.get("net") === "local";

  // ------------------------------------------------------------------ small helpers

  const session = {
    get() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; } },
    set(v) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch {} },
    clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} },
  };

  function makeId() {
    const a = new Uint8Array(6);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = rand(256); });
    return [...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  }

  function newRoomCode() {
    return Array.from({ length: 4 }, () => ROOM_LETTERS[rand(ROOM_LETTERS.length)]).join("");
  }

  // A Discord Activity instance always maps to the same room.
  function roomFromInstance(instanceId) {
    let h = 2166136261;
    for (const ch of String(instanceId)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    let code = "";
    for (let i = 0; i < 5; i++) { code += ROOM_LETTERS[(h >>> 0) % ROOM_LETTERS.length]; h = Math.imul(h, 2654435761) ^ (h >>> 13); }
    return code;
  }

  const cleanCode = (v) => String(v || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);

  // The address that joins a room. The code rides in the query string, not
  // after a #, which some QR scanner apps drop or mangle. It points at the
  // live site (SITE comes from build.js), so a QR shown on a preview
  // deployment still opens somewhere everyone can reach.
  function roomLink(code) {
    const base = typeof SITE === "object" && SITE && SITE.url ? SITE.url : `${location.origin}${location.pathname}`;
    const url = new URL(base);
    if (useLocalNet) url.searchParams.set("net", "local");
    url.searchParams.set("room", code);
    return url.toString();
  }

  // A room code in the address: ?room=ABCD from a link or QR code, or
  // #room=ABCD from the address bar of someone already in the room.
  function roomFromUrl() {
    const hash = location.hash.match(/^#room=([A-Za-z]{4,5})$/);
    const code = cleanCode(new URLSearchParams(location.search).get("room") || (hash && hash[1]) || "");
    return code.length >= 4 ? code : null;
  }
  const cleanName = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 24);

  // Every caller waits for the same download, so a view redrawn while a
  // script is still loading doesn't race ahead of it.
  const scripts = new Map();
  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => {
          scripts.delete(src); // let a later call try again
          reject(new Error(`Couldn't load ${src}`));
        };
        document.head.append(s);
      }));
    }
    return scripts.get(src);
  }

  // ------------------------------------------------------------------ transport
  //
  // Both transports offer the same small surface: send a broadcast, say who
  // this device is, and close. Handlers get messages, the list of devices in
  // the room, and the connection status.
  //
  // Who's in the room rides on the room's own messages: every device says
  // it's here every few seconds, and anyone who goes quiet has left. This
  // used to be Supabase's Presence, but when its servers time out they
  // throw the device off the channel, so it never shows up as a player.

  const BEAT = 4000;
  const GONE_AFTER = 16000;

  function roster(meta, post, onChange) {
    let mine = meta;
    const peers = new Map(); // id -> { meta, seen }
    let heard = Date.now();
    let deaf = false;
    const emit = () => onChange([mine, ...[...peers.values()].map((p) => p.meta)]);
    const say = (hello) => post({ kind: "here", meta: mine, hello: !!hello });
    const beat = setInterval(() => {
      say();
      // Hearing nobody at all looks just like this device's own connection
      // being down, so people only time out while others still get through.
      const now = Date.now();
      if (now - heard > GONE_AFTER) { deaf = true; return; }
      let gone = false;
      for (const [id, p] of peers) if (now - p.seen > GONE_AFTER) { peers.delete(id); gone = true; }
      if (gone) emit();
    }, BEAT);
    return {
      start() { say(true); emit(); },
      receive(data) {
        if (!data) return;
        const now = Date.now();
        // Back in touch: give everyone a fresh window to be heard again.
        if (deaf) { deaf = false; for (const p of peers.values()) p.seen = now; }
        heard = now;
        if (data.kind === "here" && data.meta && data.meta.id && data.meta.id !== mine.id) {
          const old = peers.get(data.meta.id);
          peers.set(data.meta.id, { meta: data.meta, seen: now });
          if (data.hello) say();
          if (!old || JSON.stringify(old.meta) !== JSON.stringify(data.meta)) emit();
        } else if (data.kind === "bye" && peers.delete(data.id)) {
          emit();
        }
      },
      track(m) { mine = m; say(); emit(); },
      bye() { post({ kind: "bye", id: mine.id }); },
      stop() { clearInterval(beat); },
    };
  }

  async function supabaseNet(room, meta, h) {
    const R = W.remote();
    if (!R) throw new Error("Online play needs the group database.");
    if (!window.supabase) await loadScript("vendor/supabase.js");
    const client = window.supabase.createClient(R.url, R.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    const ch = client.channel(`winton:${room}`, { config: { broadcast: { self: false } } });
    // Only while joined: a channel that isn't falls back to one web request per message.
    const who = roster(meta, (data) => { if (ch.state === "joined") ch.send({ type: "broadcast", event: "roster", payload: data }); }, h.presence);
    for (const event of ["state", "act", "hello"]) ch.on("broadcast", { event }, (m) => h.msg(event, m.payload));
    ch.on("broadcast", { event: "roster" }, (m) => who.receive(m.payload));
    ch.subscribe((status) => {
      h.status(status);
      if (status === "SUBSCRIBED") who.start();
    });
    const bye = () => who.bye();
    addEventListener("pagehide", bye);
    return {
      send: (event, payload) => ch.send({ type: "broadcast", event, payload }),
      track: (m) => { who.track(m); return Promise.resolve("ok"); },
      close: () => { who.stop(); bye(); removeEventListener("pagehide", bye); client.removeAllChannels(); },
    };
  }

  // Same-browser transport for testing and for trying it out across tabs:
  // add ?net=local to the address.
  function localNet(room, meta, h) {
    const bc = new BroadcastChannel(`winton-local:${room}`);
    const who = roster(meta, (data) => bc.postMessage(data), h.presence);
    bc.onmessage = ({ data }) => {
      if (!data) return;
      if (data.kind === "msg") h.msg(data.event, data.payload);
      else who.receive(data);
    };
    const bye = () => who.bye();
    addEventListener("pagehide", bye);
    setTimeout(() => {
      h.status("SUBSCRIBED");
      who.start();
    }, 30);
    return {
      send: (event, payload) => { bc.postMessage({ kind: "msg", event, payload }); return Promise.resolve("ok"); },
      track: (m) => { who.track(m); return Promise.resolve("ok"); },
      close: () => { who.stop(); bye(); removeEventListener("pagehide", bye); bc.close(); },
    };
  }

  // ------------------------------------------------------------------ room state
  //
  // S is the shared state the host broadcasts. Only the host changes it;
  // everyone else replaces their copy whenever a newer version arrives.
  // P holds what only the host needs: the deck order.

  let net = null;
  let me = null;          // { id, name, role: "player"|"screen", at }
  let room = null;
  let members = [];       // devices in the room right now (see roster)
  let S = null;
  let P = { deck: [] };
  let amHost = false;
  let connected = false;
  let hostLoop = null;
  let lastSent = 0;
  let clockBase = null;   // { left, at } for a smooth local countdown
  let createdRoom = false;
  let joinedAt = 0;

  const playerById = (id) => S && S.players.find((p) => p.id === id);
  const isOnline = (id) => members.some((m) => m.id === id);
  const teamMembers = (t) => S.players.filter((p) => p.team === t);

  function baseState(game) {
    return {
      v: 1, host: me.id, room, game, phase: "lobby", players: [],
      settings: { target: 25, seconds: 30, chaos: false, teams: 2, rounds: 10, qseconds: 20 },
      teams: [], current: 0, rot: [], turn: null, history: [], used: [], quiz: null, endedAt: null,
    };
  }

  function bump() {
    S.v++;
    S.host = me.id;
    broadcast();
    render();
    if (amHost) session.set({ ...session.get(), state: S });
  }

  function broadcast() {
    if (!net || !amHost) return;
    lastSent = Date.now();
    net.send("state", S);
  }

  // Take anything newer, or anything from a different host. Who hosts is
  // settled by elect(), so a host only takes another host's game when it's
  // further on: someone ran the room while this device was away (a locked
  // phone, say), and the game carries on from there.
  function receiveState(st) {
    if (!st || typeof st.v !== "number") return;
    if (amHost) {
      if (S && st.host !== me.id && st.v > S.v) { S = st; takeOver(); }
      return;
    }
    if (S && st.host === S.host && st.v <= S.v) return;
    S = st;
    syncClock();
    render();
  }

  // Sounds and buzzes when the shared state moves on, on every device.
  let lastPhase = null;
  function cues() {
    if (!S || lastPhase === S.phase) return;
    const prevPhase = lastPhase;
    lastPhase = S.phase;
    if (!prevPhase) return;
    if (S.phase === "review" && prevPhase === "play") { beep(440, 0.6, 0.3); haptic([200, 100, 200]); }
    if (S.phase === "winner" || S.phase === "podium") { beep(523, 0.15); setTimeout(() => beep(659, 0.15), 150); setTimeout(() => beep(784, 0.3), 300); }
    if (S.phase === "question") haptic(30);
    if (S.phase === "reveal" && S.quiz) {
      const r = S.quiz.results && S.quiz.results[me.id];
      if (r && r.points > 0) { beep(660, 0.1, 0.15); setTimeout(() => beep(990, 0.18, 0.15), 110); haptic(30); }
      else if (r) { beep(200, 0.4, 0.2); haptic([120, 60, 120]); }
    }
  }

  // ------------------------------------------------------------------ presence + host election

  function onPresence(list) {
    members = list.filter((m) => m && m.id);
    if (S && amHost) {
      let changed = false;
      for (const m of members) {
        if (m.role !== "player") continue;
        const p = playerById(m.id);
        if (!p) { S.players.push({ id: m.id, name: m.name, team: pickTeam() }); changed = true; }
        else if (p.name !== m.name) { p.name = m.name; changed = true; }
      }
      if (changed) { syncTeams(); bump(); }
      // If whoever dropped out was the last one still thinking, reveal now.
      if (S.phase === "question" && allAnswered()) revealQuestion();
    }
    elect();
    render();
  }

  // The device that's been in the room longest runs the game. A device
  // that just arrived only takes over if it made the room, or once it's
  // had time to hear from everyone else (they all check in every BEAT).
  function elect() {
    if (!me || !connected) return;
    const pool = members.some((m) => m.id === me.id) ? members : [...members, me];
    const host = pool.slice().sort((a, b) => (a.at || 0) - (b.at || 0) || String(a.id).localeCompare(String(b.id)))[0];
    const was = amHost;
    let mine = !!host && host.id === me.id;
    const settle = BEAT + 2000;
    if (mine && !was && !createdRoom && Date.now() - joinedAt < settle) {
      setTimeout(() => { elect(); render(); }, settle + 200 - (Date.now() - joinedAt));
      mine = false;
    }
    amHost = mine;
    if (amHost && !was) takeOver();
    if (!amHost && was) {
      stopHostLoop();
      // One last update, so the new host can catch up if it's behind.
      if (net && S) net.send("state", S);
    }
  }

  function takeOver() {
    if (!S) S = baseState(session.get()?.game || "30s");
    S.host = me.id;
    // Rebuild the private deck without the terms already played.
    const used = new Set(S.used || []);
    P = { deck: shuffle(W.allTerms().filter((t) => !used.has(termKey(t.term)))) };
    if (S.turn && S.turn.left != null) S.turn.endsAt = Date.now() + S.turn.left;
    if (S.quiz && S.quiz.left != null) S.quiz.endsAt = Date.now() + S.quiz.left;
    if (S.quiz && S.phase === "spin") S.quiz.spinUntil = Date.now() + 1500;
    // Fold in anyone already here.
    for (const m of members) {
      if (m.role === "player" && !playerById(m.id)) S.players.push({ id: m.id, name: m.name, team: pickTeam() });
    }
    syncTeams();
    startHostLoop();
    bump();
  }

  function startHostLoop() {
    stopHostLoop();
    let lastWhole = null;
    hostLoop = setInterval(() => {
      if (!S || !amHost) return;
      if (S.phase === "spin" && Date.now() >= (S.quiz.spinUntil || 0)) return beginQuestion();
      const t = timerOf();
      if (t && t.running) {
        t.left = Math.max(0, t.endsAt - Date.now());
        const whole = Math.ceil(t.left / 1000);
        if (whole !== lastWhole) { lastWhole = whole; S.v++; broadcast(); syncClock(); render(); }
        if (t.left <= 0) onTimeUp();
      } else if (Date.now() - lastSent > HEARTBEAT) {
        broadcast();
      }
    }, 200);
  }

  function stopHostLoop() { clearInterval(hostLoop); hostLoop = null; }

  function timerOf() {
    if (!S) return null;
    if (S.phase === "play" && S.turn) return S.turn;
    if (S.phase === "question" && S.quiz) return S.quiz;
    return null;
  }

  function syncClock() {
    const t = timerOf();
    clockBase = t && t.running ? { left: t.left, at: performance.now() } : null;
  }

  function secondsLeft() {
    if (!clockBase) { const t = timerOf(); return t ? Math.ceil((t.left || 0) / 1000) : 0; }
    return Math.max(0, Math.ceil((clockBase.left - (performance.now() - clockBase.at)) / 1000));
  }

  // ------------------------------------------------------------------ joining and leaving

  async function joinRoom(code, role, opts = {}) {
    const name = cleanName(opts.name || store.get(NAME_KEY, ""));
    if (role === "player" && !name) return toast("Add your name first.");
    if (role === "player") store.set(NAME_KEY, name);
    const prev = session.get();
    const sameRoom = prev && prev.room === code;
    me = {
      id: sameRoom && prev.id ? prev.id : makeId(),
      name: role === "screen" ? "Big screen" : name,
      role,
      at: sameRoom && prev.at ? prev.at : (opts.host ? Date.now() - 3600000 : Date.now()),
    };
    createdRoom = !!opts.host || !!(sameRoom && prev.state);
    joinedAt = Date.now();
    lastPhase = null;
    room = code;
    S = sameRoom && prev.state ? prev.state : (opts.game ? baseState(opts.game) : null);
    session.set({ room, id: me.id, at: me.at, role, game: opts.game || (S && S.game), state: S });
    members = [];
    amHost = false;
    connected = false;
    unlockAudio();
    if (!window.WINTON_DISCORD) loadScript("vendor/qrcode.js").catch(() => {}); // for the lobby's QR code
    showRoom();
    try {
      const handlers = {
        msg(event, payload) {
          if (event === "state") receiveState(payload);
          else if (event === "act" && amHost) applyAct(payload);
          else if (event === "hello" && amHost) broadcast();
        },
        presence: onPresence,
        status(status) {
          if (status === "SUBSCRIBED") {
            connected = true;
            net && net.send("hello", { id: me.id });
            // Give the room a moment to answer before deciding who hosts.
            setTimeout(() => { elect(); render(); }, 1200);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            connected = false;
            render();
          }
        },
      };
      net = useLocalNet ? localNet(code, me, handlers) : await supabaseNet(code, me, handlers);
    } catch (err) {
      toast(err.message || "Couldn't connect. Check your signal.");
      leaveRoom(true);
      return;
    }
    keepScreenOn(true);
    // Keep the room in the address bar, so a refresh lands back in it.
    const here = new URL(location.href);
    here.searchParams.delete("room");
    here.hash = `room=${code}`;
    history.replaceState(null, "", here.toString());
  }

  function leaveRoom(quiet) {
    stopHostLoop();
    try { net && net.close(); } catch {}
    net = null; S = null; room = null; me = null; amHost = false; connected = false; members = [];
    document.body.classList.remove("net-big");
    session.clear();
    keepScreenOn(false);
    const here = new URL(location.href);
    if (here.searchParams.has("room") || here.hash.startsWith("#room=")) {
      here.searchParams.delete("room");
      here.hash = "";
      history.replaceState(null, "", here.toString());
    }
    if (!quiet) show("setup");
  }

  // ------------------------------------------------------------------ host: lobby and settings

  function pickTeam() {
    const n = S.settings.teams;
    const counts = Array.from({ length: n }, (_, t) => S.players.filter((p) => p.team === t).length);
    return counts.indexOf(Math.min(...counts));
  }

  function syncTeams() {
    const n = S.settings.teams;
    for (const p of S.players) if (!(p.team >= 0 && p.team < n)) p.team = pickTeam();
    if (S.phase === "lobby") {
      S.teams = Array.from({ length: n }, (_, t) => S.teams[t] || { name: `Team ${LETTERS[t]}`, score: 0, ink: t % TEAM_INKS.length });
      S.teams.length = n;
      S.rot = Array.from({ length: n }, (_, t) => S.rot[t] || 0);
    }
  }

  function setSetting(key, value) {
    if (!amHost || S.phase !== "lobby") return;
    S.settings[key] = value;
    if (key === "teams") syncTeams();
    bump();
  }

  function setGame(game) {
    if (!amHost || S.phase !== "lobby") return;
    S.game = game;
    bump();
  }

  function shuffleTeams() {
    if (!amHost || S.phase !== "lobby") return;
    const ids = shuffle(S.players.map((p) => p.id));
    ids.forEach((id, i) => { playerById(id).team = i % S.settings.teams; });
    bump();
  }

  function startGame() {
    if (!amHost) return;
    if (!S.players.length) return toast("Wait for at least one player to join.");
    if (S.game === "30s") {
      syncTeams();
      const empty = S.teams.findIndex((_, t) => !teamMembers(t).length);
      if (empty >= 0) return toast(`${S.teams[empty].name} has nobody in it yet.`);
      S.teams.forEach((t) => { t.score = 0; });
      S.rot = S.teams.map(() => 0);
      S.current = 0;
      S.history = [];
      S.used = [];
      P = { deck: shuffle(W.allTerms()) };
      newTurn();
    } else {
      const bank = W.quizBank();
      if (!bank.length) return toast("No quiz questions loaded yet.");
      S.quiz = {
        n: 0, total: Math.min(S.settings.rounds, bank.length), used: [], q: null, kind: null,
        answers: {}, results: {}, scores: {}, history: [], left: null, running: false,
      };
      for (const p of S.players) S.quiz.scores[p.id] = blankScore();
      nextQuestion();
    }
  }

  function backToLobby() {
    if (!amHost) return;
    S.phase = "lobby";
    S.turn = null;
    S.quiz = null;
    S.teams.forEach((t) => { t.score = 0; });
    bump();
  }

  // ------------------------------------------------------------------ host: 30 Seconds

  function newTurn() {
    const t = S.current;
    const team = teamMembers(t);
    if (!team.length) { S.current = (t + 1) % S.teams.length; return newTurn(); }
    const describer = team[S.rot[t] % team.length];
    S.turn = { n: S.history.length + 1, team: t, describer: describer.id, die: null, card: [], from: 0, left: S.settings.seconds * 1000, running: false };
    S.phase = "handoff";
    bump();
  }

  // Skips whoever's up to describe. A one-person team has nobody else, so
  // the turn passes to the next team instead.
  function skipDescriber() {
    if (!amHost || S.phase !== "handoff") return;
    const t = S.turn.team;
    const team = teamMembers(t);
    if (team.length < 2) {
      S.current = (t + 1) % S.teams.length;
      newTurn();
      return;
    }
    S.rot[t]++;
    S.turn.describer = team[S.rot[t] % team.length].id;
    S.turn.die = null;
    bump();
  }

  function rollDie() {
    if (S.phase !== "handoff" || S.turn.die !== null) return;
    const faces = S.settings.chaos ? CHAOS_DIE : CLASSIC_DIE;
    S.turn.die = faces[rand(faces.length)];
    bump();
  }

  function deal() {
    const card = dealCard(P).map((x) => ({ term: x.term, category: x.category, got: false }));
    for (const c of card) S.used.push(termKey(c.term));
    return card;
  }

  function startClock() {
    if (S.phase !== "handoff" || S.turn.die === null) return;
    S.turn.card = deal();
    S.turn.from = 0;
    S.turn.endsAt = Date.now() + S.settings.seconds * 1000;
    S.turn.left = S.settings.seconds * 1000;
    S.turn.running = true;
    S.phase = "play";
    syncClock();
    bump();
  }

  function markTerm(i, value) {
    const card = S.turn && S.turn.card;
    if (!card || !card[i]) return;
    if (S.phase === "play" && i < S.turn.from) return;
    card[i].got = value == null ? !card[i].got : !!value;
    bump();
  }

  function nextCard() {
    if (S.phase !== "play") return;
    if (!S.turn.card.slice(S.turn.from).every((c) => c.got)) return;
    S.turn.from = S.turn.card.length;
    S.turn.card.push(...deal());
    bump();
  }

  function onTimeUp() {
    if (S.phase === "play") endTurn();
    else if (S.phase === "question") revealQuestion();
  }

  function endTurn() {
    if (S.phase !== "play") return;
    S.turn.running = false;
    S.turn.left = 0;
    S.phase = "review";
    syncClock();
    bump();
  }

  const gotCount = (turn) => turn.card.filter((c) => c.got).length;

  function turnPoints(got, face) {
    if (face === "double") return got * 2;
    if (typeof face === "number") return Math.max(0, got - face);
    return got;
  }

  function bankTurn() {
    if (S.phase !== "review") return;
    const t = S.turn;
    const got = gotCount(t);
    const points = turnPoints(got, t.die);
    const team = S.teams[t.team];
    team.score += points;
    S.history.push({ team: t.team, got, die: t.die, points, missed: t.card.filter((c) => !c.got).map((c) => c.term), seen: t.card.length, describer: t.describer });
    S.rot[t.team]++;
    if (team.score >= S.settings.target) {
      S.phase = "winner";
      S.winner = t.team;
      S.turn = null;
      bump();
      return;
    }
    S.current = (t.team + 1) % S.teams.length;
    newTurn();
  }

  // ------------------------------------------------------------------ host: quiz

  function blankScore() { return { score: 0, streak: 0, best: 0, right: 0, wrong: 0, fifty: true, hidden: null }; }

  function nextQuestion() {
    const Q = S.quiz;
    if (Q.n >= Q.total) { S.phase = "podium"; Q.running = false; bump(); return; }
    const bank = W.quizBank();
    const used = new Set(Q.used);
    let pool = bank.filter((q) => !used.has(q.key));
    if (!pool.length) { Q.used = []; pool = bank.slice(); }
    const open = new Set(pool.map((q) => q.kind));
    Q.kinds = Q.kinds || [];
    const kind = pickKind(Object.keys(QUIZ_KINDS).filter((k) => open.has(k)), Q.kinds);
    // Questions this device hasn't asked before come first, so the next
    // quiz in the room doesn't open with the same ones as the last.
    const q = W.freshQuestion(kind, Q.used, W.wantedLevel(Q.n + 1, Q.total));
    W.markSeen(q.key);
    Q.n++;
    Q.used.push(q.key);
    Q.kinds.push(kind);
    Q.kind = kind;
    Q.q = { key: q.key, kind: q.kind, prompt: q.prompt, quote: q.quote, options: q.options, level: q.level };
    Q.answers = {};
    Q.results = {};
    Q.final = Q.n === Q.total;
    for (const id of Object.keys(Q.scores)) Q.scores[id].hidden = null;
    for (const p of S.players) if (!Q.scores[p.id]) Q.scores[p.id] = blankScore();
    Q.running = false;
    Q.left = S.settings.qseconds * 1000;
    // The wheel takes about 1.8s to land; the rest is time to read where it stopped.
    Q.spinUntil = Date.now() + 2800;
    S.phase = "spin";
    bump();
  }

  function beginQuestion() {
    if (S.phase !== "spin") return;
    S.quiz.endsAt = Date.now() + S.settings.qseconds * 1000;
    S.quiz.left = S.settings.qseconds * 1000;
    S.quiz.running = true;
    S.phase = "question";
    syncClock();
    bump();
  }

  function answer(id, n, choice) {
    const Q = S.quiz;
    if (S.phase !== "question" || !Q || Q.n !== n || Q.answers[id] || !(choice >= 0 && choice < 4)) return;
    if (!Q.scores[id]) Q.scores[id] = blankScore();
    if (Q.scores[id].hidden && Q.scores[id].hidden.includes(choice)) return;
    Q.answers[id] = { c: choice, ms: Math.max(0, S.settings.qseconds * 1000 - Math.max(0, Q.endsAt - Date.now())) };
    if (allAnswered()) revealQuestion();
    else bump();
  }

  // Everyone still in the room has locked in an answer.
  function allAnswered() {
    const active = S.players.filter((p) => isOnline(p.id));
    return active.length > 0 && active.every((p) => S.quiz.answers[p.id]);
  }

  function useFifty(id, n) {
    const Q = S.quiz;
    if (S.phase !== "question" || !Q || Q.n !== n || Q.answers[id]) return;
    const sc = Q.scores[id] || (Q.scores[id] = blankScore());
    if (!sc.fifty) return;
    const bank = W.quizBank();
    const q = bank.find((x) => x.key === Q.q.key);
    if (!q) return;
    sc.fifty = false;
    sc.hidden = shuffle([0, 1, 2, 3].filter((i) => i !== q.answer)).slice(0, 2);
    bump();
  }

  function revealQuestion() {
    const Q = S.quiz;
    if (S.phase !== "question") return;
    const q = W.quizBank().find((x) => x.key === Q.q.key);
    const right = q ? q.answer : -1;
    Q.running = false;
    Q.left = 0;
    Q.reveal = { answer: right, why: q ? q.why : "" };
    for (const p of S.players) {
      const sc = Q.scores[p.id] || (Q.scores[p.id] = blankScore());
      const a = Q.answers[p.id];
      const correct = !!a && a.c === right;
      let points = 0;
      const parts = [];
      if (correct) {
        sc.right++;
        sc.streak++;
        sc.best = Math.max(sc.best, sc.streak);
        const speed = Math.round(SCORE.speed * Math.max(0, 1 - a.ms / (S.settings.qseconds * 1000)));
        const streak = Math.min(SCORE.streakMax, SCORE.streakStep * (sc.streak - 1));
        points = SCORE.right + speed + streak;
        parts.push(["Right answer", SCORE.right], [`Speed (${(a.ms / 1000).toFixed(1)}s)`, speed]);
        if (streak) parts.push([`Streak ×${sc.streak}`, streak]);
        if (Q.final) { points *= 2; parts.push(["Final question", "×2"]); }
      } else {
        if (a) sc.wrong++;
        sc.streak = 0;
      }
      sc.score += points;
      Q.results[p.id] = { points, correct, answered: !!a, parts };
      Q.history.push({ id: p.id, kind: Q.q.kind, correct, ms: a ? a.ms : null, points, answered: !!a });
    }
    S.phase = "reveal";
    syncClock();
    bump();
  }

  // ------------------------------------------------------------------ actions
  //
  // Every move goes through applyAct: the host's own taps directly, every
  // other device's taps over the network.

  function act(type, data = {}) {
    unlockAudio();
    const payload = { ...data, type, from: me.id };
    if (amHost) applyAct(payload);
    else if (net) net.send("act", payload);
  }

  function applyAct(a) {
    if (!S || !a || !a.type) return;
    const from = a.from;
    const describer = S.turn && S.turn.describer === from;
    const host = from === me.id;
    switch (a.type) {
      case "team":
        if (S.phase === "lobby") { const p = playerById(from); if (p && a.team >= 0 && a.team < S.settings.teams) { p.team = a.team; bump(); } }
        break;
      case "roll": if (describer || host) rollDie(); break;
      case "start": if (describer || host) startClock(); break;
      case "got": if (describer || host) markTerm(a.i, a.value); break;
      case "fix": if ((describer || host) && S.phase === "review") markTerm(a.i); break;
      case "nextcard": if (describer || host) nextCard(); break;
      case "endturn": if (describer || host) endTurn(); break;
      case "bank": if (describer || host) bankTurn(); break;
      case "answer": answer(from, a.n, a.c); break;
      case "fifty": useFifty(from, a.n); break;
    }
  }

  // ------------------------------------------------------------------ rendering
  //
  // Each view has a key built from whatever changes its layout. While the
  // key stays the same only the live bits update (clock, counts, stamps),
  // so a swipe in progress on the describer's card isn't interrupted.

  let view = { key: null, update: null };

  function render() {
    if (!me || $("#net").hidden) return;
    cues();
    const body = $("#net-body");
    const big = me.role === "screen";
    document.body.classList.toggle("net-big", big);
    $("#net-room").textContent = room ? `Room ${room}` : "";
    $("#net-status").textContent = !connected ? "Connecting…" : amHost ? (big ? "Hosting · big screen" : "Hosting") : `${members.length} here`;
    const [key, build] = chooseView(big);
    if (key !== view.key) {
      const built = build();
      body.replaceChildren(built.node);
      view = { key, update: built.update || null };
      window.scrollTo(0, 0);
    }
    if (view.update) view.update();
    document.title = titleFor(big);
  }

  function titleFor(big) {
    if (!S) return `Room ${room} · Winton`;
    const t = timerOf();
    if (t && t.running) return `${secondsLeft() <= 5 ? "🔴" : "⏱"} ${secondsLeft()}s · Room ${room}`;
    if (S.phase === "winner") return `🏆 ${S.teams[S.winner] ? S.teams[S.winner].name : ""} win · Winton`;
    if (S.phase === "podium") return "🏆 The podium · Winton quiz";
    return `Room ${room} · ${S.game === "quiz" ? "Winton quiz" : TAB}`;
  }

  function chooseView(big) {
    if (!S || !connected) return ["wait", () => ({ node: waitingView() })];
    const k = (...parts) => [S.game, S.phase, big ? "big" : "pad", amHost ? "host" : "", ...parts].join("|");
    if (S.phase === "lobby") return [k(JSON.stringify(S.players), JSON.stringify(S.settings), members.map((m) => m.id).sort().join(","), me.name), () => lobbyView(big)];
    if (S.game === "30s") {
      const t = S.turn || {};
      const mine = t.describer === me.id;
      // Redraw when the describer changes (a skip), drops in or out, or the teams change.
      if (S.phase === "handoff") return [k(t.n, t.team, t.describer, isOnline(t.describer), t.die, mine, JSON.stringify(S.teams.map((x) => x.score)), S.players.map((p) => `${p.id}:${p.team}`).join()), () => handoffView(big, mine)];
      if (S.phase === "play") return [k(t.n, t.from, t.card.length, mine), () => playView(big, mine)];
      if (S.phase === "review") return [k(t.n, mine, JSON.stringify(t.card.map((c) => c.got))), () => reviewView(big, mine)];
      if (S.phase === "winner") return [k(S.winner), () => winnerView(big)];
    } else {
      const Q = S.quiz || {};
      const mineAnswered = !!(Q.answers && Q.answers[me.id]);
      const hidden = Q.scores && Q.scores[me.id] && Q.scores[me.id].hidden;
      if (S.phase === "spin") return [k(Q.n), () => spinView(big)];
      if (S.phase === "question") return [k(Q.n, mineAnswered, JSON.stringify(hidden)), () => questionView(big)];
      if (S.phase === "reveal") return [k(Q.n), () => revealView(big)];
      if (S.phase === "podium") return [k(), () => podiumView(big)];
    }
    return ["wait", () => ({ node: waitingView() })];
  }

  // ---- shared pieces

  const strong = (text, cls = "") => el("span", { class: `net-strong ${cls}`, text });

  // Wide screens split a view into two columns. On a phone the columns
  // dissolve and everything stacks in the same order.
  function layout(cls, big, { top = [], left = [], right = [], foot = [] }) {
    return el("div", { class: `net-view ${cls}` + (big ? " big" : "") }, ...top,
      el("div", { class: "net-cols" }, el("div", { class: "net-col" }, ...left), el("div", { class: "net-col" }, ...right)),
      ...foot);
  }

  function waitingView() {
    return el("div", { class: "net-wait" },
      el("p", { class: "small center", text: connected ? "Waiting for the host…" : "Connecting to the room…" }));
  }

  // The room link as a QR code, drawn once the QR library has loaded. It's
  // always dark on light so any phone camera can read it off a stream.
  function qrNode(text, label) {
    const box = el("div", { class: "net-qr", role: "img", "aria-label": label });
    const draw = () => {
      const qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const quiet = 4;
      let d = "";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!qr.isDark(r, c)) continue;
          let run = 1;
          while (c + run < n && qr.isDark(r, c + run)) run++;
          d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
          c += run - 1;
        }
      }
      const size = n + quiet * 2;
      box.replaceChildren(W.svg(`<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true"><rect class="bg" width="${size}" height="${size}"/><path class="on" d="${d}"/></svg>`));
    };
    if (window.qrcode) draw();
    else loadScript("vendor/qrcode.js").then(() => { if (window.qrcode) draw(); else box.hidden = true; }, () => { box.hidden = true; });
    return box;
  }

  function teamChip(i) {
    const ink = TEAM_INKS[(S.teams[i] && S.teams[i].ink) ?? i];
    return el("span", { class: "chip", "aria-hidden": "true", style: { background: ink.bg, color: ink.fg }, text: LETTERS[i] });
  }

  function standings(highlight) {
    const target = S.settings.target;
    return el("div", { class: "standings" }, ...S.teams.map((t, i) => {
      const ink = TEAM_INKS[t.ink];
      const names = teamMembers(i).map((p) => p.name).join(", ");
      return el("div", { class: "team-row" + (i === highlight ? " current" : "") },
        el("div", { class: "team-head" },
          teamChip(i),
          el("span", { class: "team-name" }, el("span", { text: t.name })),
          el("span", { class: "team-score", text: String(t.score) }),
          el("span", { class: "team-of", text: `/${target}` })),
        el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: { width: `${Math.min(100, (t.score / target) * 100)}%`, background: ink.bg } })),
        names ? el("span", { class: "mini net-names", text: names }) : null);
    }));
  }

  function dieNode(face) {
    const die = el("div", { class: "die landed", role: "img" });
    if (face === null || face === undefined) {
      die.append(el("span", { class: "q", text: "?" }));
      die.setAttribute("aria-label", "Die not rolled yet");
    } else if (typeof face === "number") {
      const pips = el("span", { class: "pips" });
      for (let i = 0; i < 9; i++) pips.append(el("i", { class: PIPS[face].includes(i) ? "on" : "" }));
      die.append(pips);
      die.setAttribute("aria-label", `Die shows ${face}`);
    } else {
      die.classList.add("twist", face);
      die.append(el("span", { class: "face" + (face === "double" ? " big" : ""), text: TWISTS[face].face }));
      die.setAttribute("aria-label", `Die shows ${TWISTS[face].big}`);
    }
    return el("div", { class: "die-wrap" }, die);
  }

  function dieText(face) {
    if (face === null || face === undefined) return "Not rolled yet";
    if (typeof face === "number") return ["Lucky. Nothing comes off.", "One comes off the score.", "Two come off the score."][face];
    return TWISTS[face].note;
  }

  function button(label, onClick, cls = "btn btn-primary") {
    const b = el("button", { type: "button", class: cls }, el("span", { text: label }));
    b.addEventListener("click", () => { unlockAudio(); onClick(); });
    return b;
  }

  function cta(label, onClick, sm = false) {
    return el("div", { class: "cta" + (sm ? " cta-sm" : "") }, button(label, onClick, "btn btn-primary" + (sm ? " btn-sm" : "")));
  }

  function clockNode(cls = "") {
    const num = el("span", { class: `plates clock-num ${cls}`, "aria-hidden": "true", text: "0", "data-text": "0" });
    const sr = el("span", { class: "sr-only", role: "timer" });
    const fuse = el("div", { class: "fuse-fill" });
    const node = el("div", { class: "net-clock" }, el("div", { class: "clock" }, num, sr), el("div", { class: "fuse", "aria-hidden": "true" }, fuse));
    let lastWhole = null;
    const update = () => {
      const t = timerOf();
      const total = (S.game === "quiz" ? S.settings.qseconds : S.settings.seconds) * 1000;
      const s = secondsLeft();
      if (s !== lastWhole) {
        if (lastWhole !== null && s > 0 && s <= 5) beep(880, 0.06, 0.12);
        lastWhole = s;
        setPlates(num, String(s));
        sr.textContent = `${s} seconds left`;
        node.classList.toggle("urgent", s <= 5);
      }
      const left = clockBase ? Math.max(0, clockBase.left - (performance.now() - clockBase.at)) : (t ? t.left : 0);
      fuse.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
    };
    return { node, update };
  }

  // ---- lobby

  function lobbyView(big) {
    const players = S.players;
    const link = roomLink(room);
    const join = el("section", { class: "net-join" + (big ? " big" : "") },
      el("span", { class: "mini", text: "Room code" }),
      el("span", { class: "net-code plates", text: room, "data-text": room }),
      window.WINTON_DISCORD
        ? el("span", { class: "small", text: "Everyone in this Activity is already in." })
        : el("div", { class: "net-join-row" },
          qrNode(link, `QR code to join room ${room}`),
          el("div", { class: "net-join-text" },
            el("span", { class: "small", text: "Scan to join with your phone camera. Or open the game, tap Play online and type the code, or go to:" }),
            el("span", { class: "net-link", text: link.replace(/^https?:\/\//, "") }))));

    const games = el("div", { class: "chips net-games", role: "group", "aria-label": "Game" },
      ...[["30s", "30 Seconds"], ["quiz", "The quiz"]].map(([g, label]) => {
        const chip = el("button", { type: "button", "aria-pressed": String(S.game === g), text: label });
        if (amHost) chip.addEventListener("click", () => setGame(g)); else chip.disabled = S.game !== g;
        return chip;
      }));
    const right = [];
    const foot = [];

    if (S.game === "30s") {
      const teams = el("div", { class: "net-teams" }, ...Array.from({ length: S.settings.teams }, (_, t) => {
        const list = teamMembers(t);
        const mineHere = me.role === "player" && playerById(me.id) && playerById(me.id).team === t;
        const pick = el("button", { type: "button", class: "net-team" + (mineHere ? " mine" : ""), "aria-pressed": String(!!mineHere) },
          el("span", { class: "net-team-head" }, teamChip(t), el("span", { class: "team-name", text: `Team ${LETTERS[t]}` })),
          el("span", { class: "net-team-list" }, ...(list.length ? list.map((p) => el("span", { class: isOnline(p.id) ? "" : "off", text: p.name })) : [el("span", { class: "off", text: "Nobody yet" })])));
        if (me.role === "player") pick.addEventListener("click", () => act("team", { team: t }));
        else pick.disabled = true;
        return pick;
      }));
      right.push(el("h2", { class: "label" }, el("span", { class: "num", text: "01" }), me.role === "player" ? " Pick your team" : " Teams"), teams);
    } else {
      right.push(el("h2", { class: "label" }, el("span", { class: "num", text: "01" }), " Who's in"),
        el("ul", { class: "net-players" }, ...(players.length ? players.map((p) => el("li", { class: isOnline(p.id) ? "" : "off", text: p.name + (p.id === me.id ? " (you)" : "") })) : [el("li", { class: "off", text: "Nobody yet" })])));
    }

    if (amHost) {
      right.push(el("h2", { class: "label" }, el("span", { class: "num", text: "02" }), " House rules"), hostSettings());
      foot.push(cta(S.game === "30s" ? "Start 30 Seconds" : "Start the quiz", startGame));
      if (S.game === "30s" && players.length > 1) {
        const shuf = el("button", { type: "button", class: "link-btn center", text: "Shuffle the teams" });
        shuf.addEventListener("click", shuffleTeams);
        foot.push(shuf);
      }
    } else {
      foot.push(el("p", { class: "mode-note", text: "The host picks the game and starts it." }));
    }
    if (me.role === "player") foot.push(nameEditor());
    // The big screen gives the room card (and its QR code) a column of its
    // own, so everything else, Start included, stacks up beside it.
    const parts = big
      ? { left: [join], right: [games, ...right, ...foot] }
      : { left: [join, games], right, foot };
    return { node: layout("lobby", big, parts) };
  }

  function stepper(label, key, step) {
    const [min, max] = LIMITS[key];
    const value = S.settings[key];
    const minus = el("button", { class: "round", type: "button", "aria-label": `Less ${label}`, text: "−" });
    const plus = el("button", { class: "round", type: "button", "aria-label": `More ${label}`, text: "+" });
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    minus.addEventListener("click", () => setSetting(key, clampInt(value - step, min, max, value)));
    plus.addEventListener("click", () => setSetting(key, clampInt(value + step, min, max, value)));
    return el("div", { class: "stepper" }, el("span", { class: "mini", text: label }),
      el("div", { class: "stepper-row" }, minus, el("output", { class: "stepper-value", text: String(value) }), plus));
  }

  function hostSettings() {
    if (S.game === "30s") {
      const chaos = el("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(S.settings.chaos), "aria-label": "Chaos die" }, el("span"));
      chaos.addEventListener("click", () => setSetting("chaos", !S.settings.chaos));
      return el("div", { class: "net-settings" },
        el("div", { class: "rules-grid" }, stepper("Points to win", "target", 5), stepper("Seconds a turn", "seconds", 5), stepper("Teams", "teams", 1)),
        el("div", { class: "switch-row" }, el("div", { class: "switch-text" }, el("span", { class: "mini", text: "Chaos die" }), el("span", { class: "small", text: "Swaps in MIME, 3 WORDS and ×2 faces" })), chaos));
    }
    return el("div", { class: "net-settings" }, el("div", { class: "rules-grid" }, stepper("Questions", "rounds", 1), stepper("Seconds to answer", "qseconds", 5)));
  }

  function nameEditor() {
    const input = el("input", { type: "text", maxlength: "24", autocomplete: "off", "aria-label": "Your name" });
    input.value = me.name;
    const save = button("Save", () => {
      const name = cleanName(input.value);
      if (!name) return;
      store.set(NAME_KEY, name);
      me.name = name;
      net && net.track(me);
      toast("Name updated.");
    }, "btn btn-outline btn-sm");
    return el("details", { class: "how net-name" }, el("summary", { text: `Playing as ${me.name}` }), el("div", { class: "net-name-row" }, input, save));
  }

  // ---- 30 Seconds: handoff

  function handoffView(big, mine) {
    const t = S.turn;
    const team = S.teams[t.team];
    const describer = playerById(t.describer);
    const dname = describer ? describer.name : "Someone";
    const top = [el("header", { class: "strip" }, el("span", { text: `Turn ${String(t.n).padStart(2, "0")}` }), el("span", { text: `First to ${S.settings.target}` }))];
    const left = [standings(t.team)];
    const right = [
      el("div", { class: "up-next" }, el("span", { class: "tag", text: "Up next" }),
        el("h1", { class: "plates headline", text: team.name, "data-text": team.name }),
        el("p", { class: "small" }, mine ? "You're describing. " : `${dname} is describing. `,
          mine ? "Everyone else: eyes off your screens." : (playerById(me.id) && playerById(me.id).team === t.team ? "Get ready to guess out loud." : "Listen in, no helping."))),
      el("div", { class: "die-row" }, dieNode(t.die), el("div", { class: "die-text" },
        el("span", { class: "die-big", text: t.die === null ? "Roll" : typeof t.die === "number" ? (t.die ? `−${t.die}` : "0") : TWISTS[t.die].big }),
        el("span", { class: "small", text: dieText(t.die) }))),
    ];
    const foot = [];
    if (mine) {
      if (t.die === null) foot.push(cta("Roll the die", () => act("roll")));
      else foot.push(cta("Start the clock", () => act("start")));
    } else {
      foot.push(el("p", { class: "mode-note", text: t.die === null ? `Waiting for ${dname} to roll…` : `Waiting for ${dname} to start the clock…` }));
    }
    if (amHost && !mine) {
      const solo = teamMembers(t.team).length < 2;
      const label = isOnline(t.describer)
        ? (solo ? `Skip ${team.name}'s turn` : `Skip ${dname}`)
        : `${dname} isn't connected · ${solo ? `skip ${team.name}'s turn` : "skip to the next describer"}`;
      const skip = el("button", { type: "button", class: "link-btn center", text: label });
      skip.addEventListener("click", skipDescriber);
      foot.push(skip);
    }
    return { node: layout("handoff", big, { top, left, right, foot }) };
  }

  // ---- 30 Seconds: play

  function playView(big, mine) {
    const t = S.turn;
    const describer = playerById(t.describer);
    const dname = describer ? describer.name : "Someone";
    const clock = clockNode(big ? "huge" : "");
    const twist = TWISTS[t.die];
    const nodes = [
      el("header", { class: "strip" }, el("span", { text: S.teams[t.team].name }), el("span", { text: typeof t.die === "number" ? `Die −${t.die}` : TWISTS[t.die].big })),
      twist ? el("p", { class: "twist", text: twist.banner }) : null,
      clock.node,
    ];
    const count = el("span", { text: "0" });
    const of = el("span", { text: "5" });
    let stamps = null;
    let nextWrap = null;
    const rows = [];
    if (mine) {
      nodes.push(el("p", { class: "label-row" }, el("span", { text: "Tap or swipe → when they get it" }), el("span", {}, count, "/", of)));
      const list = el("ul", { class: "terms" });
      t.card.slice(t.from).forEach((item, j) => {
        const i = t.from + j;
        const btn = el("button", { type: "button", class: "term", "aria-pressed": String(item.got) },
          el("span", { class: "num", "aria-hidden": "true", text: String(j + 1).padStart(2, "0") }),
          el("span", { class: "body" }, el("span", { class: "word", text: item.term }), el("span", { class: "cat", text: item.category })),
          W.svg(W.ARROW),
          el("span", { class: "stamp", "aria-hidden": "true", text: "GOT IT!" }));
        const set = (value) => {
          if (S.turn.card[i].got === value) return;
          S.turn.card[i].got = value; // show it straight away; the host confirms
          btn.setAttribute("aria-pressed", String(value));
          if (value) { beep(660, 0.08, 0.12); haptic(15); }
          act("got", { i, value });
          refresh();
        };
        attachSwipe(btn, () => set(true), () => set(!S.turn.card[i].got));
        rows.push({ btn, i });
        list.append(el("li", {}, btn));
      });
      nodes.push(list);
      nextWrap = cta("Card cleared · next card", () => act("nextcard"), true);
      nextWrap.hidden = true;
      nodes.push(nextWrap);
      const end = el("button", { type: "button", class: "link-btn", text: "End turn early" });
      end.addEventListener("click", () => act("endturn"));
      nodes.push(el("div", { class: "play-foot" }, end, el("span", { class: "mini", text: "Keys 1–5 mark terms · N next card" })));
    } else {
      stamps = el("div", { class: "net-stamps", "aria-hidden": "true" });
      nodes.push(el("div", { class: "net-describing" },
        el("span", { class: "mini", text: "Describing" }), strong(dname, big ? "huge" : ""),
        el("p", { class: "small", text: playerById(me.id) && playerById(me.id).team === t.team ? "Shout your guesses in the call!" : big ? "Guess out loud, describing team only." : "Other team: no helping." }),
        el("p", { class: "label-row" }, el("span", { text: "Got so far" }), el("span", {}, count, "/", of)),
        stamps));
      if (amHost && !isOnline(t.describer)) {
        const end = el("button", { type: "button", class: "link-btn center", text: `End ${dname}'s turn` });
        end.addEventListener("click", () => act("endturn"));
        nodes.push(end);
      }
    }
    function refresh() {
      const card = S.turn.card;
      count.textContent = String(card.filter((c) => c.got).length);
      of.textContent = String(card.length);
      for (const r of rows) r.btn.setAttribute("aria-pressed", String(!!card[r.i].got));
      if (nextWrap) nextWrap.hidden = !card.slice(S.turn.from).every((c) => c.got);
      if (stamps) {
        stamps.replaceChildren(...card.map((c) => el("i", { class: c.got ? "on" : "" })));
      }
    }
    const node = el("div", { class: "net-view play" + (big ? " big" : "") }, ...nodes);
    node.keymap = mine ? (key) => {
      const n = parseInt(key, 10);
      if (n >= 1 && n <= 5) { const r = rows[n - 1]; if (r) r.btn.click(); return true; }
      if ((key === "n" || key === "N") && nextWrap && !nextWrap.hidden) { act("nextcard"); return true; }
      return false;
    } : null;
    return { node, update: () => { clock.update(); refresh(); } };
  }

  // ---- 30 Seconds: review

  function reviewView(big, mine) {
    const t = S.turn;
    const canFix = mine || amHost;
    const got = gotCount(t);
    const points = turnPoints(got, t.die);
    const team = S.teams[t.team];
    const list = el("ul", { class: "check-list" + (big ? " big" : "") }, ...t.card.map((item, i) => {
      const why = receiptFor(item.term) && receiptFor(item.term).why;
      const btn = el("button", { type: "button", class: "check", "aria-pressed": String(item.got) },
        el("span", { class: "box" }, W.svg(W.TICK)),
        el("span", { class: "tw" }, el("span", { class: "t", text: item.term }), why ? el("span", { class: "why", text: why }) : null),
        el("span", { class: "s", text: item.got ? "Got" : "Missed" }));
      if (canFix) btn.addEventListener("click", () => act("fix", { i }));
      else btn.disabled = true;
      return el("li", {}, btn);
    }));
    const face = t.die;
    const dieValue = face === "double" ? "×2" : typeof face === "number" && face > 0 ? `−${face}` : "0";
    const line = (left, right, cls = "") => el("div", { class: "r-line " + cls }, el("span", { text: left }), right);
    const receipt = el("div", { class: "receipt-wrap" }, el("div", { class: "receipt" },
      el("div", { class: "r-head", text: "WINTON 30 SECONDS" }),
      el("div", { class: "r-sub", text: `Turn ${String(t.n).padStart(2, "0")} · ${team.name}` }),
      el("div", { class: "r-rule", "aria-hidden": "true" }),
      line("Guessed", el("span", { text: String(got) })),
      line(typeof face === "number" ? "Die" : `Die: ${TWISTS[face].receipt}`, el("span", { text: dieValue })),
      el("div", { class: "r-rule double", "aria-hidden": "true" }),
      line("This turn", el("b", { text: `+${points}` }), "r-total"),
      line("New total", el("span", { text: `${team.score + points} / ${S.settings.target}` }))));
    const strip = el("header", { class: "strip" }, el("span", { text: team.name }), el("span", { text: `Turn ${String(t.n).padStart(2, "0")}` }));
    const stamp = el("div", { class: "stamp-wrap" }, el("h1", { class: "big-stamp", text: "Time's up" }));
    const hint = el("p", { class: "small center", text: canFix ? "Check the card together. Tap a term to fix it." : "Here's the card. The describer can fix any mistakes." });
    const bank = canFix
      ? cta(`Bank ${points} point${points === 1 ? "" : "s"}`, () => act("bank"))
      : el("p", { class: "mode-note", text: "Waiting for the points to be banked…" });
    // On a big screen the card fills one column so ten terms still fit.
    const parts = big
      ? { top: [strip], left: [list], right: [stamp, hint, receipt, bank] }
      : { top: [strip, stamp, hint], left: [list], right: [receipt], foot: [bank] };
    return { node: layout("review", big, parts) };
  }

  // ---- 30 Seconds: winner

  function winnerView(big) {
    const team = S.teams[S.winner];
    const awards = computeAwards({ history: S.history, teams: S.teams });
    const ranked = S.teams.map((t, i) => ({ ...t, i })).sort((a, b) => b.score - a.score);
    const top = [el("header", { class: "strip" }, el("span", { text: "Final" }), el("span", { text: `${S.history.length} turn${S.history.length === 1 ? "" : "s"}` }))];
    const left = [
      el("h1", { class: "plates headline winner-name", text: team.name, "data-text": team.name }),
      el("div", { class: "win-word", "aria-hidden": "true" }, el("span", { class: "hl" }), el("span", { text: "Champs." })),
      el("section", { class: "awards" }, el("h2", { class: "label" }, el("span", { class: "num", text: "★" }), " The awards"),
        el("ul", { class: "award-list" }, ...awards.map((a, i) => el("li", {}, burst(AWARD_INKS[i % AWARD_INKS.length], a.badge),
          el("span", { class: "a-text" }, el("span", { class: "mini", text: a.label }), el("span", { class: "a-value", text: a.value })))))),
    ];
    const right = [
      el("h2", { class: "label" }, el("span", { class: "num", text: "#" }), " Final scores"),
      el("ol", { class: "final-list" }, ...ranked.map((t, i) => el("li", {}, el("span", { text: `${i + 1}. ${t.name} (${teamMembers(t.i).map((p) => p.name).join(", ")})` }), el("span", { text: String(t.score) })))),
    ];
    return { node: layout("winner", big, { top, left, right, foot: amHost ? [cta("Back to the lobby", backToLobby)] : [] }) };
  }

  // ---- quiz: spin

  function spinView(big) {
    const Q = S.quiz;
    const kinds = Object.keys(QUIZ_KINDS);
    const wheel = el("ul", { class: "wheel" + (big ? " big" : "") });
    const paint = (lit) => wheel.replaceChildren(...kinds.map((k) => el("li", { class: k === lit ? "lit" : "", text: QUIZ_KINDS[k].wheel })));
    // Lands on the question's category in a fixed time, well inside the spin.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ticks = reduce ? [] : spinTicks(kinds, Q.kind);
    let at = 0;
    const step = () => {
      if (!wheel.isConnected) return;
      if (at >= ticks.length) { paint(Q.kind); return; }
      paint(kinds[at % kinds.length]);
      if (big || me.role === "screen") beep(500 + (at % 2) * 120, 0.025, 0.06);
      setTimeout(step, ticks[at++]);
    };
    paint(null);
    setTimeout(step, 50);
    return { node: el("div", { class: "net-view spin" + (big ? " big" : "") },
      el("header", { class: "strip" }, el("span", { text: `Question ${Q.n} of ${Q.total}` }), el("span", { text: Q.final ? "Double points" : `Room ${room}` })),
      el("h1", { class: "plates headline", text: "Spin", "data-text": "Spin" }),
      wheel,
      Q.final ? el("p", { class: "twist", text: "Final question · double points" }) : null) };
  }

  // ---- quiz: question

  function optionTiles(Q, opts) {
    const hidden = (Q.scores && Q.scores[me.id] && Q.scores[me.id].hidden) || [];
    const mine = Q.answers && Q.answers[me.id];
    return el("ul", { class: "tiles" + (opts.big ? " big" : "") }, ...Q.q.options.map((text, i) => {
      const tile = TILES[i];
      const b = el("button", { type: "button", class: "tile", style: { background: tile.bg, color: tile.fg } },
        el("span", { class: "shape", "aria-hidden": "true", text: tile.shape }),
        el("span", { class: "opt", text }),
        opts.counts ? el("span", { class: "mini net-count", text: String(opts.counts[i] || 0) }) : null);
      if (opts.reveal) {
        b.disabled = true;
        b.classList.add(i === opts.reveal.answer ? "right" : "out");
        if (mine && mine.c === i) b.append(el("span", { class: "pick mini", text: i === opts.reveal.answer ? "You ✓" : "You" }));
      } else if (opts.tap && !mine && !hidden.includes(i)) {
        b.addEventListener("click", () => { act("answer", { n: Q.n, c: i }); haptic(20); });
      } else {
        b.disabled = true;
        if (hidden.includes(i)) b.classList.add("out");
        if (mine && mine.c === i) b.classList.add("chosen");
        else if (mine) b.classList.add("out");
      }
      return el("li", {}, b);
    }));
  }

  function questionView(big) {
    const Q = S.quiz;
    const player = me.role === "player";
    const clock = clockNode(big ? "huge" : "");
    const answered = el("span", { class: "mini" });
    const top = [
      el("header", { class: "strip" }, el("span", { text: `Question ${Q.n} of ${Q.total}` }), el("span", { text: QUIZ_KINDS[Q.q.kind].title })),
      Q.final ? el("p", { class: "twist", text: "Final question · double points" }) : null,
    ];
    const right = [
      el("h1", { class: "q-prompt" + (big ? " big" : ""), text: Q.q.prompt }),
      Q.q.quote ? el("blockquote", { class: "q-quote" + (big ? " big" : ""), text: `“${Q.q.quote}”` }) : null,
    ];
    const bar = el("div", { class: "play-foot" });
    if (player) {
      const sc = Q.scores[me.id] || blankScore();
      if (!Q.answers[me.id] && sc.fifty) {
        const f = el("button", { type: "button", class: "pill fifty", text: "50:50" });
        f.addEventListener("click", () => act("fifty", { n: Q.n }));
        bar.append(f);
      } else if (Q.answers[me.id]) {
        bar.append(el("span", { class: "mini", text: "Locked in" }));
      }
      if (sc.streak) bar.append(el("span", { class: "mini", text: `Streak ${sc.streak} 🔥` }));
    }
    bar.append(answered);
    const foot = [optionTiles(Q, { tap: player, big }), bar];
    if (amHost) {
      const skip = el("button", { type: "button", class: "link-btn center", text: "Reveal now" });
      skip.addEventListener("click", revealQuestion);
      foot.push(skip);
    }
    const node = layout("question", big, { top, left: [clock.node], right, foot });
    node.keymap = player ? (key) => {
      const i = "1234".indexOf(key) >= 0 ? "1234".indexOf(key) : "abcd".indexOf(String(key).toLowerCase());
      if (i >= 0) { const b = node.querySelectorAll(".tile")[i]; if (b && !b.disabled) b.click(); return true; }
      if ((key === "f" || key === "F") && node.querySelector(".fifty")) { node.querySelector(".fifty").click(); return true; }
      return false;
    } : null;
    return { node, update: () => {
      clock.update();
      const total = S.players.filter((p) => isOnline(p.id)).length;
      answered.textContent = `${Object.keys(S.quiz.answers || {}).length}/${total} answered`;
    } };
  }

  // ---- quiz: reveal

  function leaderboard(limit, withGain) {
    const Q = S.quiz;
    const rows = S.players.map((p) => ({ p, sc: Q.scores[p.id] || blankScore(), r: (Q.results || {})[p.id] }))
      .sort((a, b) => b.sc.score - a.sc.score);
    return el("ol", { class: "net-board" }, ...rows.slice(0, limit).map(({ p, sc, r }, i) => el("li", { class: p.id === me.id ? "me" : "" },
      el("span", { class: "net-rank", text: String(i + 1) }),
      el("span", { class: "net-who", text: p.name }),
      withGain && r && r.points ? el("span", { class: "mini net-gain", text: `+${r.points}` }) : null,
      el("span", { class: "net-score", text: sc.score.toLocaleString("en") }))));
  }

  function revealView(big) {
    const Q = S.quiz;
    const counts = [0, 0, 0, 0];
    for (const a of Object.values(Q.answers || {})) counts[a.c]++;
    const r = Q.results[me.id];
    const top = [
      el("header", { class: "strip" }, el("span", { text: `Question ${Q.n} of ${Q.total}` }), el("span", { text: QUIZ_KINDS[Q.q.kind].title })),
    ];
    if (me.role === "player" && r) {
      top.push(el("div", { class: "stamp-wrap" }, el("h1", { class: "big-stamp" + (r.correct ? "" : " wrong"), text: r.correct ? "Correct" : r.answered ? "Wrong" : "Too slow" })));
      if (r.points) top.push(el("p", { class: "net-points" }, strong(`+${r.points.toLocaleString("en")}`), el("span", { class: "small", text: r.parts.map(([k, v]) => `${k} ${typeof v === "number" ? "+" + v : v}`).join(" · ") })));
    }
    const left = [
      el("p", { class: "net-asked" + (big ? " big" : ""), text: Q.q.quote ? `${Q.q.prompt} “${Q.q.quote}”` : Q.q.prompt }),
      optionTiles(Q, { reveal: Q.reveal, counts, big }),
      Q.reveal.why ? el("p", { class: "mode-note", text: Q.reveal.why }) : null,
    ];
    const right = [el("h2", { class: "label" }, el("span", { class: "num", text: "★" }), " Leaderboard"), leaderboard(big ? 8 : 5, true)];
    const foot = [amHost
      ? cta(Q.n >= Q.total ? "See the podium" : "Next question", nextQuestion)
      : el("p", { class: "mode-note", text: "Next question when the host's ready." })];
    const node = layout("reveal", big, { top, left, right, foot });
    node.keymap = amHost ? (key) => { if (key === "Enter" || key === " ") { nextQuestion(); return true; } return false; } : null;
    return { node };
  }

  // ---- quiz: podium

  function quizAwards() {
    const Q = S.quiz;
    const name = (id) => (playerById(id) || { name: "?" }).name;
    const h = Q.history;
    const awards = [];
    const fastest = h.filter((x) => x.correct).sort((a, b) => a.ms - b.ms)[0];
    if (fastest) awards.push({ label: "Fastest finger", value: `${name(fastest.id)} (${(fastest.ms / 1000).toFixed(1)}s)`, badge: "⚡" });
    const ids = Object.keys(Q.scores);
    const best = ids.sort((a, b) => Q.scores[b].best - Q.scores[a].best)[0];
    if (best && Q.scores[best].best > 1) awards.push({ label: "Hot streak", value: `${name(best)} (${Q.scores[best].best} in a row)`, badge: String(Q.scores[best].best) });
    const lost = ids.slice().sort((a, b) => Q.scores[b].wrong - Q.scores[a].wrong)[0];
    if (lost && Q.scores[lost].wrong) awards.push({ label: "Do you even read the chat?", value: `${name(lost)} (${Q.scores[lost].wrong} wrong)`, badge: "?" });
    const byKind = {};
    for (const x of h) { const k = (byKind[x.kind] ||= { right: 0, all: 0 }); k.all++; if (x.correct) k.right++; }
    const hardest = Object.entries(byKind).filter(([k, v]) => QUIZ_KINDS[k] && v.all > 1).sort((a, b) => a[1].right / a[1].all - b[1].right / b[1].all)[0];
    if (hardest && hardest[1].right < hardest[1].all) awards.push({ label: "The category nobody knows", value: `${QUIZ_KINDS[hardest[0]].wheel} (${hardest[1].right} of ${hardest[1].all})`, badge: "✗" });
    return awards;
  }

  function podiumView(big) {
    const Q = S.quiz;
    const ranked = S.players.map((p) => ({ p, sc: Q.scores[p.id] || blankScore() })).sort((a, b) => b.sc.score - a.sc.score || b.sc.right - a.sc.right);
    const myRank = ranked.findIndex((x) => x.p.id === me.id) + 1;
    const places = [[1, "2nd"], [0, "1st"], [2, "3rd"]].filter(([i]) => ranked[i]);
    const top = [el("header", { class: "strip" }, el("span", { text: "Final" }), el("span", { text: `${Q.total} questions` }))];
    const left = [
      el("h1", { class: "plates headline winner-name", text: ranked[0] ? ranked[0].p.name : "", "data-text": ranked[0] ? ranked[0].p.name : "" }),
      el("div", { class: "win-word", "aria-hidden": "true" }, el("span", { class: "hl" }), el("span", { text: "Know it all." })),
      me.role === "player" && myRank ? el("p", { class: "mode-note", text: `You finished ${myRank}${["st", "nd", "rd"][myRank - 1] || "th"} with ${ranked[myRank - 1].sc.score.toLocaleString("en")}.` }) : null,
      el("ol", { class: "podium" + (big ? " big" : ""), "aria-label": "Podium" }, ...places.map(([i, label]) => {
        const { p, sc } = ranked[i];
        const ink = TEAM_INKS[i % TEAM_INKS.length];
        return el("li", { class: `step p${i + 1}` },
          el("span", { class: "p-name", text: p.name }),
          el("span", { class: "p-score", text: sc.score.toLocaleString("en") }),
          el("span", { class: "p-block", style: { background: ink.bg, color: ink.fg } }, el("span", { text: label })));
      })),
    ];
    const right = [
      el("section", { class: "awards" }, el("h2", { class: "label" }, el("span", { class: "num", text: "★" }), " The awards"),
        el("ul", { class: "award-list" }, ...quizAwards().map((a, i) => el("li", {}, burst(AWARD_INKS[i % AWARD_INKS.length], a.badge),
          el("span", { class: "a-text" }, el("span", { class: "mini", text: a.label }), el("span", { class: "a-value", text: a.value })))))),
      el("h2", { class: "label" }, el("span", { class: "num", text: "#" }), " Final scores"),
      leaderboard(20, false),
    ];
    return { node: layout("podium-view", big, { top, left, right, foot: amHost ? [cta("Back to the lobby", backToLobby)] : [] }) };
  }

  // ------------------------------------------------------------------ screens and menu

  function showRoom() {
    view = { key: null, update: null };
    show("net", `Room ${room} · Winton`);
    render();
  }

  // Live bits (clocks) keep moving between host updates.
  setInterval(() => {
    if (!me || $("#net").hidden) return;
    if (view.update) view.update();
    const t = timerOf();
    if (t && t.running) document.title = titleFor(me.role === "screen");
  }, 200);

  // Keyboard: Enter presses the main button, numbers mark terms or answers.
  document.addEventListener("keydown", (e) => {
    if (!me || $("#net").hidden || e.target.closest("input, textarea")) return;
    const node = $("#net-body").firstElementChild;
    if (node && node.keymap && node.keymap(e.key)) { e.preventDefault(); return; }
    if (e.key === "Enter") {
      const primary = $("#net-body .btn-primary:not([hidden])");
      if (primary && !primary.closest("[hidden]")) { e.preventDefault(); primary.click(); }
    }
  });

  // With a room code (from a link or a QR code), everything's filled in:
  // someone who's played before is one tap from the room.
  const joinButton = $("#net-join-form [type=submit]");
  const joinLabel = joinButton.textContent;
  function openMenu(prefill) {
    const name = store.get(NAME_KEY, "");
    const code = prefill ? cleanCode(prefill) : "";
    $("#net-name").value = name;
    $("#net-code").value = code;
    joinButton.textContent = code ? `Join room ${code}` : joinLabel;
    $("#net-menu-note").textContent = W.remote() || useLocalNet ? "" : "Online play needs the group database, which this copy of the game isn't connected to.";
    show("net-menu", code ? `Join room ${code} · Winton` : "Play online · Winton");
    (code ? (name ? joinButton : $("#net-name")) : $("#net-code")).focus();
  }

  function pickedHostGame() {
    const on = document.querySelector("#net-host-game [aria-pressed='true']");
    return on ? on.dataset.game : "30s";
  }

  document.querySelectorAll("#net-host-game button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#net-host-game button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  $("#open-online").addEventListener("click", () => openMenu());
  $("#net-menu-back").addEventListener("click", () => show("setup"));

  $("#net-host-screen").addEventListener("click", () => joinRoom(newRoomCode(), "screen", { host: true, game: pickedHostGame() }));
  $("#net-host-play").addEventListener("click", () => joinRoom(newRoomCode(), "player", { host: true, game: pickedHostGame(), name: $("#net-name").value }));

  $("#net-join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = cleanCode($("#net-code").value);
    if (code.length < 4) { toast("Room codes are 4 letters."); return $("#net-code").focus(); }
    joinRoom(code, "player", { name: $("#net-name").value });
  });
  $("#net-join-screen").addEventListener("click", () => {
    const code = cleanCode($("#net-code").value);
    if (code.length < 4) { toast("Type the room code first."); return $("#net-code").focus(); }
    joinRoom(code, "screen");
  });
  $("#net-code").addEventListener("input", (e) => {
    e.target.value = cleanCode(e.target.value);
    joinButton.textContent = joinLabel;
  });

  $("#net-leave").addEventListener("click", () => {
    if (S && S.phase !== "lobby" && !window.confirm("Leave the room? The game carries on without you.")) return;
    leaveRoom();
  });

  // ------------------------------------------------------------------ start-up

  window.addEventListener("hashchange", () => {
    const code = roomFromUrl();
    if (code && !me) openMenu(code);
  });

  Promise.resolve(window.WINTON_BOOT).catch(() => {}).then(() => {
    const discord = window.WINTON_DISCORD;
    const saved = session.get();
    if (discord && discord.instanceId) {
      // Inside Discord: everyone in this Activity shares one room.
      const code = roomFromInstance(discord.instanceId);
      const name = store.get(NAME_KEY, "") || discord.name || "";
      $("#open-online").hidden = true;
      if (name) joinRoom(code, "player", { name, host: false, game: "30s" });
      else { openMenu(code); $("#net-join-form [type=submit]").textContent = "Join the call's game"; }
      return;
    }
    // A refresh drops you back into your room. A link or QR code for a
    // different room wins over the one this tab was in before.
    const linked = roomFromUrl();
    if (saved && saved.room && (!linked || linked === saved.room) && (saved.role === "screen" || store.get(NAME_KEY, ""))) {
      joinRoom(saved.room, saved.role, { name: store.get(NAME_KEY, ""), game: saved.game });
      return;
    }
    if (linked) openMenu(linked);
  });
})();
