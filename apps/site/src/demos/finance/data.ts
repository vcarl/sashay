// Seeded, deterministic portfolio data: the same numbers on every load.
export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

export const INTERVALS = ["1W", "1M", "1Y", "5Y"] as const;
export type Interval = (typeof INTERVALS)[number];

const END = Date.UTC(2026, 10, 20); // the demo's "today"
const DAY = 86400000;
const month = (m: number) =>
  new Date(Date.UTC(2026, 10 - m, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const day = (d: number) =>
  new Date(END - d * DAY).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const SPEC: Record<Interval, { n: number; vol: number; label: (back: number) => string }> = {
  "1W": { n: 7, vol: 0.008, label: day },
  "1M": { n: 30, vol: 0.009, label: day },
  "1Y": { n: 12, vol: 0.03, label: month },
  "5Y": { n: 20, vol: 0.06, label: (b) => `Q${4 - (b % 4)} ${2026 - Math.floor(b / 4)}` },
};

export type Bar = { label: string; value: number };
export function series(interval: Interval): Bar[] {
  const { n, vol, label } = SPEC[interval];
  const r = rng(hash(interval));
  let v = 48210;
  const bars: Bar[] = [];
  for (let back = 0; back < n; back++) {
    bars.unshift({ label: label(back), value: Math.round(v) });
    v /= 1 + (r() - 0.42) * vol * 2; // walk backwards, so older is mostly lower
  }
  return bars;
}

const HOLDINGS = [
  ["PANE", "Pane Glass Ltd"],
  ["SASH", "Sash Window Co"],
  ["PUTY", "Putty Partners"],
  ["STIL", "Frame & Stile"],
  ["GLZB", "Glazier Bond Fund"],
];
export type Txn = {
  id: string;
  title: string;
  kind: string;
  ticker?: string;
  amount: number;
  date: string;
  note: string;
};
export function transactions(interval: Interval, i: number, bar: Bar): Txn[] {
  const r = rng(hash(`${interval}${i}`));
  return Array.from({ length: 2 + Math.floor(r() * 6) }, (_, j) => {
    const [ticker, name] = HOLDINGS[Math.floor(r() * HOLDINGS.length)];
    const k = r();
    const size = Math.round(20 + r() * (interval === "5Y" ? 4000 : 900));
    const id = `TX-${(hash(`${interval}${i}${j}`) >>> 16).toString(16).toUpperCase().padStart(4, "0")}`;
    const date = bar.label;
    if (k < 0.4)
      return {
        id,
        title: `Bought ${ticker}`,
        kind: "Buy",
        ticker,
        amount: -size,
        date,
        note: `${name}, market order.`,
      };
    if (k < 0.6)
      return {
        id,
        title: `Sold ${ticker}`,
        kind: "Sell",
        ticker,
        amount: size,
        date,
        note: `${name}, limit order filled.`,
      };
    if (k < 0.8)
      return {
        id,
        title: `Dividend · ${ticker}`,
        kind: "Dividend",
        ticker,
        amount: Math.round(size / 9),
        date,
        note: `${name} paid out. Reinvested.`,
      };
    if (k < 0.93)
      return { id, title: "Monthly deposit", kind: "Deposit", amount: 500, date, note: "From current account ··4821." };
    return { id, title: "Account fee", kind: "Fee", amount: -4, date, note: "Platform fee. Small, but it adds up." };
  });
}

export const money = (n: number, sign = false) =>
  `${sign && n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
