// Forty houseplants: hours of direct sun a day, waterings a month, and one line of care.
export type Plant = { id: string; name: string; light: number; water: number; note: string };

const TABLE: [string, number, number, string][] = [
  ["Snake plant", 1.5, 1.5, "Let the soil dry right out between drinks."],
  ["ZZ plant", 0.8, 2, "Thrives on neglect. Soggy soil is the only real threat."],
  ["Pothos", 2, 4, "Trails happily. Trim it to keep it bushy."],
  ["Monstera", 3, 4.4, "Wipe the big leaves so they can breathe."],
  ["Peace lily", 1.2, 6, "Droops when thirsty and perks up within hours."],
  ["Boston fern", 1.8, 10, "Likes a humid bathroom and never drying out."],
  ["Maidenhair fern", 1, 11, "Sulks if the soil dries even once."],
  ["Spider plant", 3.6, 5, "Hang it high so the babies can dangle."],
  ["Fiddle-leaf fig", 5.5, 4, "Hates being moved. Pick a spot and stay."],
  ["Rubber plant", 4, 3.4, "Bright light keeps the leaves dark and glossy."],
  ["Aloe vera", 7, 2, "Water deeply, then leave it for weeks."],
  ["Jade plant", 7.5, 1.8, "Wrinkled leaves mean it wants a drink."],
  ["Echeveria", 8.2, 1.4, "Give it your sunniest sill."],
  ["Golden barrel cactus", 9.6, 0.8, "Barely needs water in winter."],
  ["Bunny ear cactus", 9, 1.2, "The soft-looking spots still prickle."],
  ["String of pearls", 6, 2.6, "Plant it shallow. Buried stems rot."],
  ["Calathea", 1.5, 8, "Rain or filtered water keeps the tips green."],
  ["Prayer plant", 2.2, 7.4, "Folds its leaves up at night."],
  ["Chinese evergreen", 1.2, 4.6, "Fine in a dim corner far from the window."],
  ["Cast iron plant", 0.4, 3, "Survives almost anything but sodden soil."],
  ["Philodendron", 2.6, 5.2, "Give the climbing kinds a moss pole."],
  ["Dracaena", 3, 3, "Brown tips often come from hard tap water."],
  ["Bird of paradise", 8, 5, "Needs a big pot and a bright window to flower."],
  ["Croton", 6.6, 5.6, "The more sun, the brighter the leaves."],
  ["Hoya", 4.6, 2.8, "Leave the old flower spurs. They bloom again."],
  ["Christmas cactus", 3.4, 4, "A cool, dark autumn sets the buds."],
  ["African violet", 2.8, 6.6, "Water from below to keep the leaves dry."],
  ["Moth orchid", 3.2, 3.6, "Water when the roots turn silvery."],
  ["Parlour palm", 1.6, 5.6, "Happy in low light and a steady room."],
  ["Areca palm", 4.2, 7, "Mist it when the heating is on."],
  ["Kentia palm", 2.2, 4.2, "Slow growing and forgiving."],
  ["Ponytail palm", 7.8, 1.2, "Stores water in its swollen trunk."],
  ["Basil", 8.6, 11.4, "Pinch the tips so it doesn't flower."],
  ["Rosemary", 9.8, 3.8, "Likes it bright and on the dry side."],
  ["Venus flytrap", 9.2, 9, "Rainwater only. Keep its saucer damp."],
  ["Lemon tree", 9.4, 6, "Wants all the sun you can give it."],
  ["Polka dot plant", 4.8, 8.6, "Goes leggy in shade. Pinch it back."],
  ["Tradescantia", 4, 6, "Cuttings root in a glass of water."],
  ["Begonia rex", 2.4, 6, "Keep water off the patterned leaves."],
  ["Pilea", 5, 4.6, "Turn it weekly so it grows straight."],
];

export const PLANTS: Plant[] = TABLE.map(([name, light, water, note]) => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  light,
  water,
  note,
}));

export const MAX_LIGHT = 10;
export const MAX_WATER = 12;

// The plants nearest `p` on the chart, `p` first.
export const neighbours = (p: Plant) =>
  [...PLANTS].sort(
    (a, b) =>
      Math.hypot((a.light - p.light) / MAX_LIGHT, (a.water - p.water) / MAX_WATER) -
      Math.hypot((b.light - p.light) / MAX_LIGHT, (b.water - p.water) / MAX_WATER),
  );

// Which way the window faces, and the direct sun it gets.
export const WINDOWS = { North: 1, East: 3, West: 5, South: 8 } as const;
export type Facing = keyof typeof WINDOWS;
