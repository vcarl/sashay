// A seeded house: each directory's contents come from a PRNG keyed by its id,
// so the tree is the same on every load and only built as far as it's opened.
import { rng } from "../finance/data";

export type Item = { name: string; desc: string; colour: string; shape: Shape };
export type Node = { id: string; name: string; depth: number; item?: Item };
type Shape = "button" | "key" | "spool" | "round" | "card" | "pencil" | "candle" | "spoon";

export const MAX_DEPTH = 6;
// Places, by depth: the house holds rooms, rooms hold furniture, and so on down.
const PLACES = [
  [],
  ["Kitchen", "Parlour", "Bedroom", "Attic", "Bathroom", "Study"],
  ["Dresser", "Cupboard", "Bookcase", "Writing desk", "Wardrobe", "Sideboard", "Toy chest", "Nightstand"],
  ["Top drawer", "Middle drawer", "Bottom drawer", "Upper shelf", "Lower shelf", "Secret compartment"],
  ["Tin box", "Shoebox", "Hatbox", "Biscuit tin", "Sewing box", "Cigar box"],
  ["Matchbox", "Coin purse", "Envelope", "Jam jar", "Velvet pouch", "Pill tin"],
  ["Walnut shell", "Ring box", "Locket", "Acorn cup", "Snuff box", "Tiny envelope"],
];
const ITEMS: Item[] = [
  { name: "Brass key", desc: "Opens something. Nobody remembers what.", colour: "#d9a62a", shape: "key" },
  { name: "Blue button", desc: "Four holes, one missing coat.", colour: "#1f3fcb", shape: "button" },
  { name: "Spool of thread", desc: "Mint green, half used, wholly tangled.", colour: "#7fd1b4", shape: "spool" },
  { name: "Glass marble", desc: "A cat's eye with a chip in it.", colour: "#e85a40", shape: "round" },
  { name: "Postcard", desc: "From Margate, 1987. Wish you were here.", colour: "#ffc846", shape: "card" },
  { name: "Pencil stub", desc: "Too short to sharpen, too good to throw out.", colour: "#ffc846", shape: "pencil" },
  { name: "Birthday candle", desc: "Used once, on a cake shaped like a house.", colour: "#f2a7b8", shape: "candle" },
  { name: "Teaspoon", desc: "Silver, from a hotel that has since closed.", colour: "#b8b4aa", shape: "spoon" },
  { name: "Old penny", desc: "Older than the house, and smug about it.", colour: "#c07a3e", shape: "round" },
  { name: "Recipe card", desc: "Gran's lemon drizzle. Do not lose.", colour: "#f6eedc", shape: "card" },
  { name: "Odd button", desc: "Tomato red. Its coat is long gone.", colour: "#e85a40", shape: "button" },
  { name: "Glass bead", desc: "The colour of a window at dusk.", colour: "#7fd1b4", shape: "round" },
  { name: "Luggage tag", desc: "Says 'Lisbon' in someone else's handwriting.", colour: "#c9b48a", shape: "card" },
  { name: "Cotton reel", desc: "Butter yellow, for mending curtains.", colour: "#ffc846", shape: "spool" },
  { name: "Spare key", desc: "For the back door. Probably.", colour: "#b8b4aa", shape: "key" },
  { name: "Tea light", desc: "Kept for power cuts and birthdays.", colour: "#f6eedc", shape: "candle" },
];

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
const shuffle = <T>(xs: T[], r: () => number) =>
  xs
    .map((x) => [r(), x] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x);

export const root: Node = { id: "h", name: "The house", depth: 0 };

const cache = new Map<string, Node[]>();
export function kids(dir: Node): Node[] {
  let out = cache.get(dir.id);
  if (out) return out;
  const r = rng(hash(dir.id));
  const d = dir.depth + 1;
  // Every first child goes at least one more level down, so there is always a path to the bottom.
  const first = dir.depth === 0 || dir.id.endsWith("-0");
  const n = dir.depth === 0 ? 6 : first && d <= MAX_DEPTH ? 2 + Math.floor(r() * 5) : Math.floor(r() * 7);
  const places = d <= MAX_DEPTH ? shuffle(PLACES[d], r) : [];
  const items = shuffle(ITEMS, r);
  out = Array.from({ length: n }, (_, i) => {
    const id = `${dir.id}-${i}`;
    const place = dir.depth === 0 || (first && i === 0) || (places.length && r() < 0.5) ? places.shift() : undefined;
    return place ? { id, name: place, depth: d } : { id, name: items[i].name, depth: d, item: items[i] };
  });
  cache.set(dir.id, out);
  return out;
}

const INK = "#1b1a17";
const S = `stroke="${INK}" stroke-width="2" stroke-linejoin="round"`;
const SHAPES: Record<Shape, (c: string) => string> = {
  button: (c) =>
    `<circle cx="24" cy="24" r="17" fill="${c}" ${S}/><circle cx="24" cy="24" r="11" fill="none" ${S} opacity=".4"/>${[19, 29].flatMap((x) => [19, 29].map((y) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${INK}"/>`)).join("")}`,
  key: (c) =>
    `<path d="M21 22h20v5h-3v5h-4v-5h-3v4h-4v-4h-6z" fill="${c}" ${S}/><circle cx="14" cy="24.5" r="9" fill="${c}" ${S}/><circle cx="12" cy="24.5" r="3" fill="#f6eedc" ${S}/>`,
  spool: (c) =>
    `<rect x="15" y="12" width="18" height="24" fill="${c}" ${S}/><path d="M15 18h18M15 24h18M15 30h18" ${S} opacity=".35"/><rect x="10" y="7" width="28" height="6" rx="2" fill="#c8955a" ${S}/><rect x="10" y="35" width="28" height="6" rx="2" fill="#c8955a" ${S}/>`,
  round: (c) =>
    `<circle cx="24" cy="24" r="15" fill="${c}" ${S}/><path d="M17 27c3-7 9-9 15-7" fill="none" ${S} opacity=".45"/><circle cx="19" cy="18" r="3" fill="#f6eedc"/>`,
  card: (c) =>
    `<rect x="7" y="12" width="34" height="24" rx="2" fill="${c}" ${S}/><path d="M12 19h14M12 24h11M12 29h13" ${S}/><rect x="31" y="16" width="6" height="7" fill="#e85a40" ${S}/>`,
  pencil: (c) =>
    `<g transform="rotate(-35 24 24)"><rect x="8" y="19" width="22" height="10" fill="${c}" ${S}/><rect x="4" y="19" width="5" height="10" fill="#f2a7b8" ${S}/><path d="M30 19l11 5-11 5z" fill="#f6eedc" ${S}/><path d="M37 22.5l4 1.5-4 1.5z" fill="${INK}"/></g>`,
  candle: (c) =>
    `<rect x="18" y="18" width="12" height="24" rx="2" fill="${c}" ${S}/><path d="M18 25l12-4M18 33l12-4M18 41l12-4" ${S} opacity=".4"/><path d="M24 6c4 4 4 8 0 10-4-2-4-6 0-10z" fill="#ffc846" ${S}/>`,
  spoon: (c) =>
    `<g transform="rotate(40 24 24)"><ellipse cx="24" cy="12" rx="7" ry="9" fill="${c}" ${S}/><rect x="22" y="20" width="4" height="24" rx="2" fill="${c}" ${S}/></g>`,
};
export const picture = (it: Item) => `<svg viewBox="0 0 48 48" aria-hidden="true">${SHAPES[it.shape](it.colour)}</svg>`;
