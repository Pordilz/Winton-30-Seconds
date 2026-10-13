# Winton 30 Seconds

A take on the board game *30 Seconds* built from your group's own people, places, sayings and in-jokes. It runs in a phone browser, so you pass one phone around and don't need a board, cards, a die or an egg timer.

It looks like a homemade zine printed on a risograph. Two inks, violet and blue, overprint into a deep indigo, and headlines sit slightly off-register. Guessing a term slams a rubber stamp on it, and each turn's score prints out as a till receipt.

The Winton deck (642 terms pulled from the group chat: names, places, slang, roasts, nonsense noises and the Meta AI saga, all shuffled together), the lore and the quiz questions live in a Supabase database, not in this repo, so the group's names and stories aren't sitting on a public GitHub page. The game is hosted on Vercel, which plugs the database in at build time.

## How to play

1. Split into teams (2 to 6). On each turn, one person on the team describes and the rest guess.
2. **Roll the die** in the app. It lands on 0, 1 or 2, and that number comes off the team's score for the turn.
3. **Start the clock.** The describer sees five terms and has 30 seconds to get their team to say them, in any order. The dots next to each category show how deep a cut it is: ● everyone gets it, ●● regulars, ●●● deep lore.

   Related terms never share a card, so one clue can't give away two answers. Each card also tries to cover five different categories.
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
- Anyone with the game's link can read the deck, the lore and the quiz, so share the link with the group rather than posting it publicly.

**Running it locally:** open `index.html` in a browser for the starter deck. For the real deck, run:

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_PUBLISHABLE_KEY=<key> node build.js
```

and serve the `dist/` folder.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The screens: cover and setup, deck builder, the lore, incoming terms, up next, the 30 seconds, time's up and winner, plus the quiz's setup, spin, question, reveal and podium. |
| `game.js` | Game logic: loading the group deck from Supabase, dealing cards without related terms, dice, timer, swipe, scoring, receipts, the lore, awards, share links, saving, and the quiz. |
| `style.css` | The riso look: inks, overprint, halftone shadows, stamps and the receipt. |
| `words.js` | The starter deck of example terms and sample quiz questions, used when there's no database. |
| `build.js` | Vercel's build step. Copies the game into `dist/` and writes `config.js` from the environment variables. |
| `vercel.json` | Tells Vercel to run `build.js` and serve `dist/`. |
| `fonts/` | Bricolage Grotesque and Space Mono, bundled so the game works offline. Both are under the SIL Open Font License; the licence files are in the folder. |
