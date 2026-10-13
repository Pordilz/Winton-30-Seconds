// Runs before game.js. Inside a Discord Activity it loads Discord's SDK,
// sends the Supabase traffic through Discord's proxy (Activities can only
// talk to their own address), and records which Activity this is, so
// everyone in the voice channel joins the same room.
//
// Outside Discord this does nothing. Add ?discord=mock to the address to
// try the Discord code path in a normal browser.
(() => {
  const params = new URLSearchParams(location.search);
  const inDiscord = params.has("frame_id") && params.has("instance_id");
  const mock = params.get("discord") === "mock";
  if (!inDiscord && !mock) return;

  const cfg = typeof DISCORD === "object" && DISCORD ? DISCORD : {};
  if (inDiscord && !cfg.clientId) {
    console.warn("Discord: no DISCORD_CLIENT_ID was set at build time.");
    return;
  }
  document.documentElement.classList.add("in-discord");

  window.WINTON_BOOT = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "vendor/discord-sdk.js";
    script.onerror = () => resolve();
    script.onload = async () => {
      try {
        const lib = window.DiscordEmbeddedSDK;
        if (inDiscord && typeof SUPABASE === "object" && SUPABASE && SUPABASE.url) {
          // Matches the URL mapping in the Discord Developer Portal:
          // /supabase -> <project>.supabase.co
          lib.patchUrlMappings([{ prefix: "/.proxy/supabase", target: new URL(SUPABASE.url).host }]);
        }
        const sdk = inDiscord ? new lib.DiscordSDK(cfg.clientId) : new lib.DiscordSDKMock("0", null, null, null);
        await Promise.race([sdk.ready(), new Promise((r) => setTimeout(r, 8000))]);
        window.WINTON_DISCORD = { instanceId: sdk.instanceId, sdk, mock };
      } catch (err) {
        console.warn("Discord setup failed", err);
      }
      resolve();
    };
    document.head.append(script);
  });
})();
