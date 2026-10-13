# Winton 30 Seconds

A take on the board game *30 Seconds* built from your group's own people, places, sayings and in-jokes. It runs in a phone browser, so you pass one phone around and don't need a board, cards, a die or an egg timer.

It looks like a homemade zine printed on a risograph. Two inks, violet and blue, overprint into a deep indigo, and headlines sit slightly off-register. Guessing a term slams a rubber stamp on it, and each turn's score prints out as a till receipt.

The Winton deck (about 290 terms pulled from the group chat) and the lore live in a Supabase database, not in this repo, so the group's names and stories aren't sitting on a public GitHub page. The game is hosted on Vercel, which plugs the database in at build time.

## How to play

1. Split into teams (2 to 6). On each turn, one person on the team describes and the rest guess.
2. **Roll the die** in the app. It lands on 0, 1 or 2, and that number comes off the team's score for the turn.
3. **Start the clock.** The describer sees five terms and has 30 seconds to get their team to say them, in any order. The dots next to each category show how deep a cut it is: ● everyone gets it, ●● regulars, ●●● deep lore.
4. The describer can't say the term or any part of it, can't use "sounds like" or "rhymes with" clues, and can't spell it out.
5. **Tap a term, or swipe it right,** the moment your team gets it. Tapping again un-marks it.
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
- **After dark:** adds the cruder terms to the deck. Off by default.

### Extras

- **The lore:** tap **The lore** on the cover for who's who in the group (nicknames, how everyone types, mains, the running jokes), the side characters, the chat's numbers and awards, and a timeline of eras.
- **Awards** at the end of the game: best turn, the term nobody could get, the team with the worst luck on the die, and the best mime when the Chaos die is on.
- **Saving:** the game saves after every turn. If the page refreshes or the phone locks, a **Resume last game** button brings it back.
- **Works offline:** each phone keeps a copy of the deck and the lore after the first time it opens the game, so a game with no signal still uses the real deck.
- **Phone features:** the screen stays on during a turn, and the phone beeps for the last five seconds and vibrates when time runs out (on phones that allow it).

## The group deck

### Adding terms from your phone: "Feed the deck"

Tap **Feed the deck** on the cover. Type a term, pick a category and add it. Or use **Paste a list** to add a whole list from a note or the group chat in one go, one term per line.

New terms go straight into the shared deck, and everyone gets them the next time they open the game. The screen shows the latest terms the group has added.

With no signal, new terms wait on your phone under **Only on this phone**. Tap **Send these to the group deck** once you're back online.

The app can only add terms. It can't edit or delete anything, so nobody can wipe the deck from a phone.

### Editing the deck and the lore

Everything lives in two tables in the Supabase project (job-hub). Open it at [supabase.com/dashboard](https://supabase.com/dashboard), then go to **Table Editor**.

- **`winton_terms`** is the deck, one row per term:
  - `term` and `category`: what shows on the card.
  - `difficulty`: 1, 2 or 3 (the dots).
  - `receipt`: the small print on the "Time's up" screen.
  - `after_dark`: `true` puts the term behind the After dark switch.
  - `source`: `chat` for the original deck, `player` for terms added in the app.

  Fix, delete or re-categorise terms here. Terms added from phones arrive without a difficulty or receipt; fill those in whenever you like.
- **`winton_lore`** holds the lore screen as one JSON document (the row with key `winton`): `squad` (the member profiles), `cast`, `numbers`, `awards` and `eras`. Edit the JSON to update a profile or add an era.

Changes show up on phones the next time the game opens.

### The starter deck: `words.js`

`words.js` holds 48 made-up example terms. A phone uses them only before it has ever connected, or when the game runs without the database (opened straight from the files, or hosted somewhere without the Supabase settings). In that mode, **Feed the deck** keeps terms on the phone and offers **Send as a link** and **Copy as lines for words.js** instead.

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

- The Vercel project needs two environment variables: **`SUPABASE_URL`** and **`SUPABASE_PUBLISHABLE_KEY`**. The build (`node build.js`) copies the game into `dist/` and writes them into `config.js`, so they never have to be committed. The publishable key is meant for browsers. The database's row-level security only lets it read the game's two tables and add new terms.
- Anyone with the game's link can read the deck and the lore, so share the link with the group rather than posting it publicly.

**Running it locally:** open `index.html` in a browser for the starter deck. For the real deck, run:

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_PUBLISHABLE_KEY=<key> node build.js
```

and serve the `dist/` folder.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The screens: cover and setup, deck builder, the lore, incoming terms, up next, the 30 seconds, time's up and winner. |
| `game.js` | Game logic: loading the group deck from Supabase, deck, dice, timer, swipe, scoring, receipts, the lore, awards, share links and saving. |
| `style.css` | The riso look: inks, overprint, halftone shadows, stamps and the receipt. |
| `words.js` | The starter deck of example terms, used when there's no database. |
| `build.js` | Vercel's build step. Copies the game into `dist/` and writes `config.js` from the environment variables. |
| `vercel.json` | Tells Vercel to run `build.js` and serve `dist/`. |
| `fonts/` | Bricolage Grotesque and Space Mono, bundled so the game works offline. Both are under the SIL Open Font License; the licence files are in the folder. |
