# Winton 30 Seconds

A version of the board game *30 Seconds* that uses your group's own people, places, sayings and in-jokes. It runs in a phone browser, so you pass one phone around and don't need a board, cards, a die or an egg timer.

## How to play

1. Split into teams (2 to 6). On each turn, one person on the team describes.
2. **Roll the die** in the app. It lands on 0, 1 or 2, and that number comes off the team's score for the turn.
3. **Start the clock.** The describer sees five terms and has 30 seconds to get their team to say them, in any order.
4. The describer can't say the term or any part of it, can't use "sounds like" or "rhymes with" clues, and can't spell it out.
5. Tap each term when your team gets it. When time runs out, both teams check the results, and you can fix any mistakes before the points are added.
6. **Points = terms guessed − the die.** The first team to reach the target score wins.

You can change the target score and the turn length on the setup screen. If someone refreshes the page or the phone locks, the game is saved after every turn, and a **Resume last game** button brings it back.

## Making it yours

All the terms live in **`words.js`**, and that's the only file you need to change. Right now it has 48 made-up example terms so you can try the game. Replace them with your own.

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
- You can rename, add or remove categories however you like. The category appears under each term as a small hint for the describer.
- Duplicate terms are skipped automatically.

You don't need to install anything to edit it. On GitHub, open `words.js`, click the pencil icon, make your changes and commit them.

### Collecting terms from the group

The best decks come from everyone chipping in, not one person writing them all:

1. **Make a shared list:** a Google Form, a shared note, or a message in the group chat asking each person for 20 to 30 terms.
2. **Ask with prompts** so people don't get stuck: people we all know, places we always end up, things someone always says, trips and nights out, food, nicknames, songs, cars, pets, and the stories that get retold at every get-together.
3. **Filter with these questions before adding a term:**
   - *Would most of the group know it?* If only two people get the reference, cut it.
   - *Can you describe it without saying it?* A term like "the thing" can't be clued.
   - *Would everyone laugh?* Keep the jokes affectionate. Someone in the room will be the answer.
4. **Mix the difficulty.** Aim for mostly easy terms with a few hard ones, like the real game.
5. **Aim for at least 200 terms.** Each turn uses 5 terms, and a 25-point game between two teams usually takes 20 to 25 turns, which is 100 to 125 terms. With 200 or more terms you get through a whole evening without repeats. A rematch keeps drawing from the same shuffled deck, so terms don't repeat straight away.

## Playing it

**On one computer or phone:** download the repo and open `index.html` in a browser. It works offline because there's no server or build step.

**For the whole group, using a link:** host it for free on GitHub Pages:

1. In the repo on GitHub, go to **Settings → Pages**.
2. Under *Build and deployment*, set **Source** to "Deploy from a branch", choose your branch (for example `main`) and the `/ (root)` folder, and save.
3. After a minute or two you get a link like `https://<username>.github.io/Winton-30-Seconds/`. Share it in the group chat. Anyone who opens it on their phone can host a game.
4. Every time someone commits new terms to `words.js`, the link updates automatically.

## Files

| File | What it is |
| --- | --- |
| `words.js` | Your group's terms. Edit this one. |
| `index.html` | The screens: setup, die roll, the 30-second turn, review and winner. |
| `game.js` | Game logic: deck shuffling, die, timer, scoring and saving. |
| `style.css` | The look. It follows the phone's light or dark mode. |
