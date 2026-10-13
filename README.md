# Winton 30 Seconds

A take on the board game *30 Seconds* built from your group's own people, places, sayings and in-jokes. It runs in a phone browser, so you pass one phone around and don't need a board, cards, a die or an egg timer. When you're not in the same room, everyone can play on their own phone or PC over a Discord call (see [Playing online](#playing-online)).

It looks like a homemade zine printed on a risograph. Two inks, violet and blue, overprint into a deep indigo, and headlines sit slightly off-register. Guessing a term slams a rubber stamp on it, and each turn's score prints out as a till receipt.

The Winton deck (642 terms pulled from the group chat: names, places, slang, roasts, nonsense noises and the Meta AI saga, all shuffled together), the lore and the quiz questions live in a Supabase database, not in this repo, so the group's names and stories aren't sitting on a public GitHub page. The game is hosted on Vercel, which plugs the database in at build time.

## How to play

1. Split into teams (2 to 6). On each turn, one person on the team describes and the rest guess.
2. **Roll the die** in the app. It lands on 0, 1 or 2, and that number comes off the team's score for the turn.
3. **Start the clock.** The describer sees five terms and has 30 seconds to get their team to say them, in any order. The dots next to each category show how deep a cut it is: ● everyone gets it, ●● regulars, ●●● deep lore.

   Related terms never share a card, so one clue can't give away two answers. Each card also tries to cover five different categories.
4. The describer can't say the term or any part of it, can't use "sounds like" or "rhymes with" clues, and can't spell it out.
5. **Tap a term, or swipe it right,** the moment your team gets it. Tapping again un-marks it.
   Got all five with time still on the clock? Tap **Card cleared · next card** to deal five more and keep scoring on the same clock.
6. When time's up, both teams check the card and fix any mistakes before the points go in. The small print under each term is why it's in the deck, for settling "that's not even a thing" arguments.
7. **Points = terms guessed − the die.** The first team to reach the target wins.

### House rules

On the setup screen you can change:

- **Points to win:** 5 to 100.
- **Seconds a turn:** 10 to 90.
- **Chaos die:** swaps the die's duplicate faces for ones that change the rules for that turn:
  - **MIME:** no talking, act everything out.
  - **3 WORDS:** every clue is three words or fewer.
  - **×2:** double points for the turn.

  None of these faces take anything off the score.

## The quiz

Tap **Play the quiz** on the cover for a second game: trivia about the chat, pass-the-phone style. It borrows from Kahoot, Trivia Crack, *Who Wants to Be a Millionaire* and Jackbox.

1. Add teams (or single players) and pick the number of rounds (default 5) and the seconds to answer (default 20). In each round, every team answers one question.
2. **Spin** for a category: Who said it, What's the reference, Polls, Numbers, Nicknames, When was it, or Meta AI. Questions get harder as the rounds go on.
3. **Show the question** and tap one of the four coloured answers before the clock runs out.
4. Scoring:
   - **500** for a right answer, plus up to **500** more the faster you answer.
   - **Streak bonus:** +100 for each right answer in a row after the first, up to +500.
   - The **final round counts double**.
   - A wrong answer or running out of time scores 0 and ends the streak.
5. Each team has one **50:50**, which knocks out two wrong answers.
6. After every answer, the reveal shows the right answer, the receipt explaining it, the points breakdown and the scoreboard.
7. The quiz ends on a podium with awards: fastest finger, hot streak, biggest answer, "do you even read the chat?", the category nobody knows, and the teams that never needed their 50:50.

Each phone remembers which questions it has asked recently and serves fresh ones first. The quiz saves after every answer, so **Resume last quiz** brings it back after a refresh.

### Extras

- **The lore:** tap **The lore** on the cover for who's who in the group (nicknames, how everyone types, mains, the running jokes), the side characters, the chat's numbers and awards, and a timeline of eras.
- **Awards** at the end of the game: best turn, the term nobody could get, the team with the worst luck on the die, and the best mime when the Chaos die is on.
- **Saving:** the game saves after every turn. If the page refreshes or the phone locks, a **Resume last game** button brings it back.
- **Works offline:** each phone keeps a copy of the deck, the lore and the quiz after the first time it opens the game, so a game with no signal still uses the real deck.
- **Phone features:** the screen stays on during a turn, and the phone beeps for the last five seconds and vibrates when time runs out (on phones that allow it).

## Playing online

For game nights on a call: everyone joins one room from their own phone or PC, and the game keeps every device in sync. Talk over Discord (or any call) as normal.

### Start a room

1. Tap **Play online** on the cover and pick **30 Seconds** or **The quiz**.
2. Choose how to host:
   - **Big screen to stream:** this device shows the shared screen (the clock, the scores, the questions) but doesn't play. Open it on a PC and share that window on the call with Discord's screen share or Go Live, so everyone sees it.
   - **Host from my phone:** you host and play on the same device. Use this when nobody's streaming.
3. The room shows a four-letter code, a QR code and a link. Everyone else scans the QR code with their phone camera (or opens the link, or opens the game and taps **Play online** and types the code), adds their name and taps **Join the room**.
4. In 30 Seconds, everyone picks a team on their own device. The host sets the house rules (or taps **Shuffle the teams**) and starts the game.

### 30 Seconds online

- The game picks the describer, taking turns within each team. **Only the describer's device shows the card**; the big screen and everyone else see the clock, who's describing and how many terms they've got.
- The describer rolls the die, starts the clock and taps or swipes terms as their team shouts the answers on the call. **Card cleared · next card** works the same as in person.
- When time's up, everyone sees the card. The describer or the host fixes any mistakes and banks the points.

### The quiz online

- Every player answers on their own device, Kahoot-style: the spin and the question show on every screen, and each player taps one of the four colours.
- Scoring is the same as the pass-the-phone quiz (speed, streaks, the final question counts double), and **every player has their own 50:50**.
- The answer is revealed as soon as everyone has answered, or when the clock runs out. The reveal shows how many people picked each answer and the leaderboard. The host moves on with **Next question** (or **Reveal now** to skip the wait).

### On a PC

The layout widens on a PC, and the big screen fills a full-screen browser window for streaming. Keyboard shortcuts:

- **1 to 5** mark terms on the card and **N** deals the next card.
- **1 to 4** (or **A to D**) answer a quiz question and **F** uses the 50:50.
- **Enter** presses the main button.

### If someone drops out

- Refreshing the page puts you straight back in the room.
- If the host drops out, the device that's been in the room longest takes over and the game carries on from where it was.
- If the describer drops out before their turn starts, the host can skip to the next person on that team. Mid-turn, the host can end the turn for them.

Rooms run over Supabase Realtime in the same project as the deck. Nothing about a room is saved in the database; it only exists while people are in it.

### Playing inside Discord (Activity)

The game can also run inside Discord as an Activity, so nobody needs a link or a code: everyone in the voice channel who opens the Activity lands in the same room. The first person in hosts, and each player types their name once. To set it up:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application (call it Winton).
2. Under **Activities → URL Mappings**, add two mappings (targets have no `https://`):

   | Prefix | Target |
   | --- | --- |
   | `/` | `winton-30-seconds.vercel.app` |
   | `/supabase` | `pzlrihoqzbddbwuzcudp.supabase.co` |

   The second one lets the game reach the deck and the rooms, because an Activity can only talk to addresses that are mapped.
3. Under **Activities → Settings**, tick **Enable Activities**.
4. Copy the **Application ID** from **General Information** and add it to the Vercel project as the environment variable **`DISCORD_CLIENT_ID`**, then redeploy.
5. In Discord, join a voice channel, open the Activities launcher (the rocket) and pick Winton. While the app is unpublished, Discord only shows it to the app's owner and team, so add the group to a team in the Developer Portal if they can't see it.

Until `DISCORD_CLIENT_ID` is set, the game can't connect from inside Discord; everywhere else it works as normal. Streaming the big screen needs none of this.

## The group deck

### Adding terms from your phone: "Feed the deck"

Tap **Feed the deck** on the cover. Type a term, pick a category and add it. Or use **Paste a list** to add a whole list from a note or the group chat in one go, one term per line.

New terms go straight into the shared deck, and everyone gets them the next time they open the game. The screen shows the latest terms the group has added.

With no signal, new terms wait on your phone under **Only on this phone**. Tap **Send these to the group deck** once you're back online.

The app can only add terms. It can't edit or delete anything, so nobody can wipe the deck from a phone.

### Editing the deck and the lore

Everything lives in three tables in the Supabase project (job-hub). Open it at [supabase.com/dashboard](https://supabase.com/dashboard), then go to **Table Editor**.

- **`winton_terms`** is the deck, one row per term:
  - `term` and `category`: what shows on the card.
  - `difficulty`: 1, 2 or 3 (the dots).
  - `receipt`: the small print on the "Time's up" screen.
  - `families`: tags for terms that would give each other away (for example, every nickname for the same person shares a tag). Terms with a tag in common never land on the same card. Words the terms share already count, so a tag is only needed when the link isn't in the wording.
  - `source`: `chat` for the original deck, `player` for terms added in the app.

  Fix, delete or re-categorise terms here. Terms added from phones arrive without a difficulty or receipt; fill those in whenever you like.
- **`winton_quiz`** is the quiz, one row per question:
  - `kind`: `who_said`, `reference`, `poll`, `numbers`, `nickname`, `when` or `meta`. This is the category the spin lands on.
  - `prompt`: the question. `quote` (optional) is a line from the chat, shown as a quote card.
  - `options`: exactly four answers. `answer` must be one of them, word for word.
  - `receipt`: the explanation on the reveal screen.
  - `difficulty`: 1 to 3. Easy questions come up in early rounds, hard ones later.

  The app can only read this table.
- **`winton_lore`** holds the lore screen as one JSON document (the row with key `winton`): `squad` (the member profiles), `cast`, `numbers`, `awards` and `eras`. Edit the JSON to update a profile or add an era.

Changes show up on phones the next time the game opens.

### The starter deck: `words.js`

`words.js` holds 48 made-up example terms and 8 sample quiz questions. A phone uses them only before it has ever connected, or when the game runs without the database (opened straight from the files, or hosted somewhere without the Supabase settings). In that mode, **Feed the deck** keeps terms on the phone and offers **Send as a link** and **Copy as lines for words.js** instead.

Keep the group's real terms in the database, not in `words.js`: this repo is public.

### Writing good terms

1. **Ask with prompts** so people don't get stuck: people we all know, places we always end up, things someone always says, trips and nights out, food, nicknames, songs, cars, pets, and the stories that get retold every time.
2. **Filter before adding:**
   - *Would most of the group know it?* If only two people get the reference, cut it.
   - *Can you describe it without saying it?* A term like "the thing" can't be clued.
   - *Would everyone laugh?* Keep the jokes affectionate. Someone in the room will be the answer.
3. **Mix the difficulty.** Aim for mostly easy terms with a few hard ones.
4. **Aim for at least 200 terms.** Each turn uses 5, and a 25-point game between two teams usually takes 20 to 25 turns, or 100 to 125 terms. A rematch keeps drawing from the same shuffled deck, so terms don't repeat straight away.

## Hosting

The game is hosted on Vercel, connected to this repo, so every push deploys on its own.

- The Vercel project needs two environment variables: **`SUPABASE_URL`** and **`SUPABASE_PUBLISHABLE_KEY`**. The build (`node build.js`) copies the game into `dist/` and writes them into `config.js`, so they never have to be committed. The publishable key is meant for browsers. The database's row-level security only lets it read the game's three tables and add new terms.
- **`DISCORD_CLIENT_ID`** is optional: the Discord application's ID, for running the game as a Discord Activity. It's public too.
- Anyone with the game's link can read the deck, the lore and the quiz, so share the link with the group rather than posting it publicly.

**Running it locally:** open `index.html` in a browser for the starter deck. For the real deck, run:

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_PUBLISHABLE_KEY=<key> node build.js
```

and serve the `dist/` folder.

To try online play without the database, add `?net=local` to the address and open the game in several tabs of the same browser: the tabs talk to each other directly. Add `&discord=mock` as well to try the Discord Activity flow.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The screens: cover and setup, deck builder, the lore, incoming terms, up next, the 30 seconds, time's up and winner, the quiz's setup, spin, question, reveal and podium, and the online menu and room. |
| `game.js` | Game logic: loading the group deck from Supabase, dealing cards without related terms, dice, timer, swipe, scoring, receipts, the lore, awards, share links, saving, and the quiz. |
| `online.js` | Online rooms: joining by code, choosing the host, syncing every device, the big screen, and the online versions of 30 Seconds and the quiz. |
| `discord-boot.js` | Runs first inside a Discord Activity: loads Discord's SDK, routes the database through Discord's proxy and picks the room for the voice channel. Does nothing outside Discord. |
| `vendor/` | Bundled copies of supabase-js (for the rooms) and Discord's Embedded App SDK, both MIT licensed (`vendor/LICENSES.md`). |
| `style.css` | The riso look: inks, overprint, halftone shadows, stamps and the receipt. |
| `words.js` | The starter deck of example terms and sample quiz questions, used when there's no database. |
| `build.js` | Vercel's build step. Copies the game into `dist/` and writes `config.js` from the environment variables. |
| `vercel.json` | Tells Vercel to run `build.js` and serve `dist/`. |
| `icons/`, `manifest.webmanifest` | The riso "30" icon for the browser tab and the phone home screen ("Add to Home Screen" opens the game full screen). |
| `fonts/` | Bricolage Grotesque and Space Mono, bundled so the game works offline. Both are under the SIL Open Font License; the licence files are in the folder. |
