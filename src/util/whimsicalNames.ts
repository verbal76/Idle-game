// Whimsical name generator. Picks a random adjective + noun from
// curated lists so a fresh profile gets a name like "Stinky Donut"
// or "Sonny Keyboard" instead of the bland "Rider" default.
//
// Lists are intentionally over-stocked so collisions are rare even
// with a couple of profiles per device. ~40 × ~40 = 1600 unique
// pairings. Updates here are JS-only; ship via OTA.

const ADJECTIVES = [
  'Stinky', 'Sonny', 'Wobbly', 'Crusty', 'Soggy', 'Crispy', 'Frosty',
  'Cosmic', 'Glitchy', 'Bouncy', 'Ticklish', 'Drowsy', 'Snazzy', 'Plucky',
  'Sleepy', 'Grumpy', 'Fuzzy', 'Mighty', 'Sneaky', 'Wonky', 'Dapper',
  'Bubbly', 'Spicy', 'Salty', 'Cheesy', 'Nervous', 'Greasy', 'Cranky',
  'Quirky', 'Goofy', 'Twitchy', 'Squishy', 'Funky', 'Rusty', 'Lumpy',
  'Zesty', 'Chunky', 'Velvety', 'Gravelly', 'Saucy', 'Toasty', 'Dizzy',
  'Wonky', 'Soggy', 'Jumpy', 'Bashful', 'Itchy', 'Mossy',
];

const NOUNS = [
  'Donut', 'Keyboard', 'Pickle', 'Waffle', 'Toaster', 'Banjo', 'Penguin',
  'Walrus', 'Goblin', 'Bagel', 'Muffin', 'Lobster', 'Yeti', 'Cactus',
  'Doorknob', 'Pancake', 'Burrito', 'Hammock', 'Marshmallow', 'Squid',
  'Trumpet', 'Spork', 'Pretzel', 'Dingo', 'Sausage', 'Mongoose',
  'Chipmunk', 'Pudding', 'Noodle', 'Eggplant', 'Quokka', 'Wombat',
  'Flamingo', 'Macaroni', 'Otter', 'Manatee', 'Crouton', 'Pajama',
  'Tambourine', 'Snickerdoodle', 'Avocado', 'Kazoo', 'Galosh', 'Pickle',
  'Limerick', 'Banister', 'Ottoman', 'Catfish',
];

export function generateWhimsicalName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return `${adj} ${noun}`;
}
