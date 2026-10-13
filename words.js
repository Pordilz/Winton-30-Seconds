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
//  - Optional: a list called AFTER_DARK adds cruder terms that only
//    play when "After dark" is switched on.
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
