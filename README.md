# Winton 30 Seconds

A take on the board game *30 Seconds* built from your group's own people, places, sayings and in-jokes. It runs in a phone browser, so you pass one phone around and don't need a board, cards, a die or an egg timer.

It looks like a homemade zine printed on a risograph. Two inks, pink and blue, overprint into purple, and headlines sit slightly off-register. Guessing a term slams a rubber stamp on it, and each turn's score prints out as a till receipt.

## How to play

1. Split into teams (2 to 6). On each turn, one person on the team describes and the rest guess.
2. **Roll the die** in the app. It lands on 0, 1 or 2, and that number comes off the team's score for the turn.
3. **Start the clock.** The describer sees five terms and has 30 seconds to get their team to say them, in any order.
4. The describer can't say the term or any part of it, can't use "sounds like" or "rhymes with" clues, and can't spell it out.
5. **Tap a term, or swipe it right,** the moment your team gets it. Tapping again un-marks it.
6. When time's up, both teams check the card and fix any mistakes before the points go in.
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

### Extras

- **Awards** at the end of the game: best turn, the term nobody could get, the team with the worst luck on the die, and the best mime when the Chaos die is on.
- **Saving:** the game saves after every turn. If the page refreshes or the phone locks, a **Resume last game** button brings it back.
- **Phone features:** the screen stays on during a turn, and the phone beeps for the last five seconds and vibrates when time runs out (on phones that allow it).

## Making it yours

There are two ways to get terms into the deck, and you can use both.

### 1. From your phone: "Feed the deck"

Tap **Feed the deck** on the cover. Type a term, pick a category and add it. Or use **Paste a list** to add a whole list from a note or the group chat in one go, one term per line.

Terms you add this way are saved on that phone. To share them:

- **Send as a link:** shares a link through your phone's share sheet, or copies it. When a friend opens the link, the game asks whether to add your terms to their deck. It doesn't need an account or a server, because the terms are carried in the link itself.
- **Copy as lines for words.js:** copies your terms already formatted for `words.js`, so you can make them permanent for everyone (below).

A good routine: everyone adds terms on their own phone and sends their link to one person. That person opens each link, then uses **Copy as lines for words.js** and pastes the result into `words.js`.

### 2. In the code: `words.js`

`words.js` is the shared deck that everyone gets. It currently has 48 made-up example terms so you can try the game. Replace them with your own.

```js
const WORDS = {
  "People": [
    "Uncle Steve",
    "Whoever always forgets their wallet",
  ],
  "Sayings": [
    "Just one more round",
  ],
};
```

- Each line in quotes is one term, and each line needs a comma at the end.
- You can rename, add or remove categories. Each term's category shows under it as a small hint, and the categories become the chips in **Feed the deck**.
- Duplicate terms are skipped automatically.

You don't need to install anything to edit it. On GitHub, open `words.js`, click the pencil icon, make your changes and commit.

### Writing good terms

1. **Ask with prompts** so people don't get stuck: people we all know, places we always end up, things someone always says, trips and nights out, food, nicknames, songs, cars, pets, and the stories that get retold every time.
2. **Filter before adding:**
   - *Would most of the group know it?* If only two people get the reference, cut it.
   - *Can you describe it without saying it?* A term like "the thing" can't be clued.
   - *Would everyone laugh?* Keep the jokes affectionate. Someone in the room will be the answer.
3. **Mix the difficulty.** Aim for mostly easy terms with a few hard ones.
4. **Aim for at least 200 terms.** Each turn uses 5, and a 25-point game between two teams usually takes 20 to 25 turns, or 100 to 125 terms. A rematch keeps drawing from the same shuffled deck, so terms don't repeat straight away.

## Playing it

**On one phone or computer:** download the repo and open `index.html` in a browser. Everything, including the fonts, is in the repo, so it works offline. Share links need the hosted version below.

**For the whole group, using a link:** host it for free on GitHub Pages:

1. In the repo on GitHub, go to **Settings → Pages**.
2. Under *Build and deployment*, set **Source** to "Deploy from a branch", choose your branch (for example `main`) and the `/ (root)` folder, and save.
3. After a minute or two you get a link like `https://<username>.github.io/Winton-30-Seconds/`. Share it in the group chat. Anyone who opens it on their phone can host a game.
4. Every time someone commits new terms to `words.js`, the link updates automatically.

## Files

| File | What it is |
| --- | --- |
| `words.js` | The shared deck. Edit this one. |
| `index.html` | The screens: cover and setup, deck builder, incoming terms, up next, the 30 seconds, time's up and winner. |
| `game.js` | Game logic: deck, dice, timer, swipe, scoring, awards, share links and saving. |
| `style.css` | The riso look: inks, overprint, halftone shadows, stamps and the receipt. |
| `fonts/` | Bricolage Grotesque and Space Mono, bundled so the game works offline. Both are under the SIL Open Font License; the licence files are in the folder. |
