// Vercel build step. Copies the game into dist/ and writes config.js from
// the SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY environment variables, so the
// database address never has to be committed to this (public) repo.
//
// Run locally the same way:
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node build.js
// Without them, the build still works and the game uses the starter deck.

const fs = require("fs");
const path = require("path");

const root = __dirname;
const out = path.join(root, "dist");
const FILES = ["index.html", "style.css", "game.js", "online.js", "discord-boot.js", "words.js", "manifest.webmanifest"];
const DIRS = ["fonts", "icons", "vendor"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(root, file), path.join(out, file));
for (const dir of DIRS) {
  fs.mkdirSync(path.join(out, dir), { recursive: true });
  for (const file of fs.readdirSync(path.join(root, dir))) {
    fs.copyFileSync(path.join(root, dir, file), path.join(out, dir, file));
  }
}

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
// The Discord application ID is public too; it's only needed for the
// Discord Activity (see "Playing inside Discord" in README.md).
const discordId = (process.env.DISCORD_CLIENT_ID || "").trim();
let config = url && key
  ? `// Written by build.js. The publishable key is safe to ship to browsers.\nconst SUPABASE = ${JSON.stringify({ url, key })};\n`
  : "// No Supabase settings at build time: the game uses the starter deck in words.js.\n";
if (discordId) config += `const DISCORD = ${JSON.stringify({ clientId: discordId })};\n`;
fs.writeFileSync(path.join(out, "config.js"), config);

console.log((url && key
  ? `Built dist/ connected to ${new URL(url).host}`
  : "Built dist/ with no Supabase settings (starter deck only)") + (discordId ? ", with Discord" : ""));
