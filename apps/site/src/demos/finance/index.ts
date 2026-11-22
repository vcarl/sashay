import { createSashay, type Length } from "@vcarl/sashay";
import { type Bar, INTERVALS, type Interval, money, series, type Txn, transactions } from "./data";
import "./finance.css";

// A fixed workspace of three panes: Overview → Period → Details.
// The Guide grows it one step at a time: `drawer` adds the Interval drawer, `compactBelow` is
// passed straight through, and `initial` opens it on a layout, a period, a transaction or the drawer.
// `onUrl` gets the app's URL (layout, period, transaction) whenever it changes.
// The `#region` comments mark the excerpts the Guide shows.
type Initial = { layout?: string; period?: number; txn?: number; drawerOpen?: boolean };
export function mount(
  el: HTMLElement,
  {
    drawer = true,
    compactBelow,
    initial = {},
    // #region url
    onUrl = (url: string) => history.replaceState(history.state, "", url),
    // #endregion
  }: { drawer?: boolean; compactBelow?: Length; initial?: Initial; onUrl?: (url: string) => void } = {},
) {
  let interval: Interval = "1M";
  let bars: Bar[] = [];
  let txns: Txn[] = [];
  let picked = -1;
  let current = -1;

  el.classList.add("finance");
  // #region frame
  el.innerHTML = `
    <section data-sashay-pane="overview"></section>
    <section data-sashay-pane="period"></section>
    <section data-sashay-pane="details"></section>`;
  // #endregion
  const $ = (s: string) => el.querySelector(s) as HTMLElement;
  $('[data-sashay-pane="overview"]').innerHTML = `
    <header><p class="fi-label">Portfolio</p><p class="fi-value"></p><p class="fi-delta"></p></header>
    <svg class="fi-chart" preserveAspectRatio="none" role="group" aria-label="Portfolio value"></svg>
    <p class="fi-axis"></p>`;
  // #region drawer
  // The drawer's content sits in the frame, named for the pane whose edge opens it.
  const buttons = INTERVALS.map((v) => `<button data-interval="${v}">${v}</button>`).join("");
  if (drawer)
    el.insertAdjacentHTML(
      "afterbegin",
      `<aside data-sashay-drawer="overview"><p class="fi-label">Show the last</p>${buttons}</aside>`,
    );
  // #endregion
  // #region url
  const saveToUrl = (layout = sash.layout) => {
    const params = new URLSearchParams({ layout });
    if (picked >= 0) params.set("period", bars[picked].label.toLowerCase().replace(/\W+/g, "-"));
    if (current >= 0) params.set("txn", txns[current].id);
    onUrl(`?${params}`);
  };
  // #endregion

  // #region frame
  const sash = createSashay(el, {
    panes: [
      {
        id: "overview",
        title: "Overview",
        focus: 1 / 2,
        // #region drawer
        edge: drawer ? { drawer: { width: "9rem", title: "Interval" } } : undefined,
        // #endregion
      },
      { id: "period", title: "Period", focus: 1 / 4 },
      { id: "details", title: "Details", focus: 1 / 4 },
    ],
    defaultLayout: [1, 1], // only Overview open
    // #region url
    layout: initial.layout, // a saved code, say from new URLSearchParams(location.search)
    onChange: saveToUrl,
    // #endregion
    // #region compact
    compactBelow, // a Length; "40rem" when left out
    // #endregion
    onClose(id) {
      if (id === "period") pick(-1);
      if (id === "details") {
        current = -1;
        el.querySelector("[aria-current]")?.removeAttribute("aria-current");
      }
    },
  });
  // #endregion

  function chart() {
    bars = series(interval);
    const lo = Math.min(...bars.map((b) => b.value)) * 0.97;
    const hi = Math.max(...bars.map((b) => b.value));
    const last = bars[bars.length - 1].value;
    const delta = last - bars[0].value;
    $(".fi-value").textContent = money(last);
    $(".fi-delta").textContent = `${money(delta, true)} (${((delta / bars[0].value) * 100).toFixed(1)}%) · ${interval}`;
    const svg = $(".fi-chart");
    svg.setAttribute("viewBox", `0 0 ${bars.length} 100`);
    svg.innerHTML = bars
      .map((b, i) => {
        const h = 4 + ((b.value - lo) / (hi - lo)) * 96;
        return `<g data-bar="${i}" tabindex="0" role="button" aria-label="${b.label}: ${money(b.value)}"><rect x="${i}" width="1" height="100" fill="transparent"/><rect x="${i + 0.14}" y="${100 - h}" width="0.72" height="${h}"/></g>`;
      })
      .join("");
    $(".fi-axis").innerHTML = `<span>${bars[0].label}</span><span>${bars[bars.length - 1].label}</span>`;
    for (const b of el.querySelectorAll<HTMLElement>("[data-interval]"))
      b.setAttribute("aria-pressed", String(b.dataset.interval === interval));
  }

  function pick(i: number) {
    picked = i;
    current = -1;
    for (const g of el.querySelectorAll("[data-bar]"))
      g.toggleAttribute("data-picked", g.getAttribute("data-bar") === String(i));
    // #region frame
    // While Period covers part of Overview, keep the picked bar in the visible slice.
    const x = `calc(1.25rem + ${(i + 0.5) / bars.length} * (100% - 2.5rem))`;
    sash.keepInView("overview", i < 0 ? null : x);
    // #endregion
    if (i < 0) return saveToUrl();
    const bar = bars[i];
    txns = transactions(interval, i, bar);
    const net = txns.reduce((s, t) => s + t.amount, 0);
    $('[data-sashay-pane="period"]').innerHTML = `
      <header><p class="fi-label">${interval === "1W" || interval === "1M" ? "Day" : "Period"}</p><h3>${bar.label}</h3>
      <p class="fi-sub">${txns.length} transactions · net ${money(net, true)}</p></header>
      <ul>${txns.map((t, j) => `<li><button data-txn="${j}"><span>${t.title}</span><span class="fi-amt">${money(t.amount, true)}</span></button></li>`).join("")}</ul>`;
    // #region frame
    sash.close("details");
    sash.reveal("period");
    // #endregion
    saveToUrl();
  }

  function open(j: number) {
    const t = txns[j];
    current = j;
    for (const b of el.querySelectorAll("[data-txn]"))
      b.toggleAttribute("aria-current", b.getAttribute("data-txn") === String(j));
    $('[data-sashay-pane="details"]').innerHTML = `
      <header><p class="fi-label">${t.kind}</p><h3>${t.title}</h3><p class="fi-big">${money(t.amount, true)}</p></header>
      <dl><dt>Date</dt><dd>${t.date}</dd>${t.ticker ? `<dt>Holding</dt><dd>${t.ticker}</dd>` : ""}<dt>Account</dt><dd>Brokerage ··7310</dd><dt>Reference</dt><dd>${t.id}</dd></dl>
      <p class="fi-note">${t.note}</p>`;
    sash.reveal("details");
    saveToUrl();
  }

  const onClick = (e: Event) => {
    const t = e.target as Element;
    const bar = t.closest("[data-bar]");
    const iv = t.closest<HTMLElement>("[data-interval]");
    const txn = t.closest<HTMLElement>("[data-txn]");
    if (bar) pick(Number(bar.getAttribute("data-bar")));
    else if (txn) open(Number(txn.dataset.txn));
    else if (iv && iv.dataset.interval !== interval) {
      interval = iv.dataset.interval as Interval;
      sash.close("details");
      sash.close("period");
      chart();
      pick(-1);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && (e.target as Element).closest("[data-bar]")) {
      e.preventDefault();
      onClick(e);
    }
  };
  el.addEventListener("click", onClick);
  el.addEventListener("keydown", onKey);
  chart();
  $('[data-sashay-pane="period"]').innerHTML = `<p class="fi-empty">Pick a bar to see its transactions.</p>`;
  $('[data-sashay-pane="details"]').innerHTML = `<p class="fi-empty">Pick a transaction.</p>`;
  if (initial.period !== undefined) pick(initial.period);
  if (initial.txn !== undefined) open(initial.txn);
  if (initial.layout) sash.setLayout(initial.layout); // reveal() may have moved the dividers
  if (initial.drawerOpen) sash.toggleDrawer("overview", true);
  saveToUrl();
  return () => {
    el.removeEventListener("click", onClick);
    el.removeEventListener("keydown", onKey);
    sash.destroy();
    el.classList.remove("finance");
    el.innerHTML = "";
  };
}
