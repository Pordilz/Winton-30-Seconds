// =====================================================================
//  STARTER DECK
// =====================================================================
//
//  The real group deck lives in the Supabase database (the winton_terms
//  table) and loads when the game is deployed with its Supabase settings.
//  See "The group deck" in README.md.
//
//  This file is the fallback: the deck a phone uses before it has ever
//  connected, or a copy of the game with no database at all. The terms
//  below are made-up EXAMPLES so the game works out of the box. Keep
//  your group's real terms in the database, not here: this repo is
//  public.
//
//  - Each line in "quotes" is one term the describer has to get their
//    team to guess.
//  - Keep the comma at the end of each line.
//  - Duplicate terms are ignored, so don't worry about repeats.
//
//  QUIZ (at the bottom) is the same idea for the quiz: made-up sample
//  questions that play until the phone has loaded the group's quiz.
// =====================================================================

const WORDS = {
  "People": [
    "Uncle Steve",
    "The neighbour with the loud dog",
    "Gran",
    "Our old maths teacher",
    "The barber",
    "Whoever always forgets their wallet",
    "Coach",
    "The cousin from overseas",
  ],

  "Places": [
    "The holiday house",
    "The corner shop",
    "Grandpa's garage",
    "The usual pub",
    "The campsite with no signal",
    "The back garden",
    "The church hall",
    "The beach car park",
  ],

  "Moments": [
    "The 2019 road trip",
    "The flat tyre in the rain",
    "The karaoke night",
    "The power cut at the wedding",
    "The time we got lost hiking",
    "New Year's on the roof",
    "The burnt Christmas dinner",
    "The quiz night win",
  ],

  "Sayings": [
    "Just one more round",
    "Who invited you",
    "I'm five minutes away",
    "Who ate my leftovers",
    "That's a tomorrow problem",
    "We should do this more often",
    "Not again",
    "Trust me, I know a shortcut",
  ],

  "Things": [
    "The group chat",
    "The broken barbecue",
    "The old camper van",
    "The lost car keys",
    "The ugly jersey",
    "The family photo album",
    "The cooler box",
    "The board game nobody finishes",
  ],

  "Food & drink": [
    "Mom's lasagne",
    "Sunday roast",
    "The infamous potato salad",
    "Midnight toasties",
    "The cake that collapsed",
    "Burnt sausages",
    "Granny's biscuits",
    "The mystery punch",
  ],
};

// Sample quiz questions. Each has a kind (who_said, reference, games, poll,
// numbers, nickname, when, meta), a prompt, an optional quote, four
// options, the answer (one of the options), and a receipt explaining it.
const QUIZ = [
  { kind: "who_said", prompt: "Who said it?", quote: "I'm five minutes away", options: ["Uncle Steve", "Gran", "Coach", "The barber"], answer: "Uncle Steve", receipt: "He was not five minutes away.", difficulty: 1 },
  { kind: "reference", prompt: "\"The flat tyre\" was on which trip?", options: ["The 2019 road trip", "The karaoke night", "New Year's on the roof", "The quiz night"], answer: "The 2019 road trip", receipt: "In the rain, with no jack.", difficulty: 1 },
  { kind: "poll", prompt: "The group voted on the best Sunday food. What won?", options: ["Sunday roast", "Mom's lasagne", "Midnight toasties", "Burnt sausages"], answer: "Sunday roast", receipt: "It wasn't close.", difficulty: 2 },
  { kind: "numbers", prompt: "How many people turned up to the karaoke night?", options: ["4", "7", "11", "15"], answer: "7", receipt: "Seven, and one microphone.", difficulty: 2 },
  { kind: "nickname", prompt: "Who goes by \"Coach\"?", options: ["The PE teacher", "Uncle Steve", "The barber", "Gran"], answer: "The PE teacher", receipt: "Still blows the whistle at braais.", difficulty: 1 },
  { kind: "when", prompt: "When was the burnt Christmas dinner?", options: ["2018", "2020", "2021", "2023"], answer: "2021", receipt: "The smoke alarm was the guest of honour.", difficulty: 3 },
  { kind: "games", prompt: "Which game ended the group's friendships for a whole weekend?", options: ["Monopoly", "Mario Kart", "Uno", "FIFA"], answer: "Mario Kart", receipt: "Nobody has forgiven the blue shell.", difficulty: 1 },
  { kind: "meta", prompt: "What did the group chat bot get asked first?", options: ["To settle an argument", "For a recipe", "To write a poem", "The weather"], answer: "To settle an argument", receipt: "It refused to pick a side.", difficulty: 2 },
  { kind: "who_said", prompt: "Who said it?", quote: "Trust me, I know a shortcut", options: ["Gran", "Coach", "Uncle Steve", "The cousin from overseas"], answer: "The cousin from overseas", receipt: "We did not get there faster.", difficulty: 2 },
];
