// Temporary check: can two clients use Supabase Realtime (broadcast + presence)
// with the publishable key? Deployed on a throwaway preview branch only.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const topic = "winton:rtcheck-" + Math.random().toString(36).slice(2, 8);
  const log = [], t0 = Date.now(), at = () => Date.now() - t0;
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const a = createClient(url, key, opts), b = createClient(url, key, opts);
  const join = (client, id) => new Promise((resolve) => {
    const ch = client.channel(topic, { config: { broadcast: { self: false }, presence: { key: id } } });
    ch.on("presence", { event: "sync" }, () => log.push([at(), id, "presence", Object.keys(ch.presenceState()).sort().join(",")]));
    ch.on("broadcast", { event: "ping" }, ({ payload }) => log.push([at(), id, "got ping", payload.n]));
    ch.subscribe(async (status, err) => {
      log.push([at(), id, "status", status, err ? String(err.message || err) : ""]);
      if (status === "SUBSCRIBED") { await ch.track({ name: id }); resolve(ch); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(null);
    });
  });
  const [ca, cb] = await Promise.all([join(a, "host"), join(b, "phone")]);
  if (ca && cb) {
    await new Promise((r) => setTimeout(r, 1200));
    const r1 = await ca.send({ type: "broadcast", event: "ping", payload: { n: 1 } });
    log.push([at(), "host", "send result", r1]);
    await new Promise((r) => setTimeout(r, 1500));
  }
  await a.removeAllChannels(); await b.removeAllChannels();
  const got = log.some((l) => l[1] === "phone" && l[2] === "got ping");
  const both = log.some((l) => l[2] === "presence" && l[3] === "host,phone");
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: got && both, broadcast: got, presence: both, node: process.version, log }, null, 1));
}
