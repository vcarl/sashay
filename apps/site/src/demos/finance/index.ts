import { createSashay } from "@vcarl/sashay";
import { type Bar, INTERVALS, type Interval, money, series, type Txn, transactions } from "./data";
import "./finance.css";

// A fixed workspace of three panes: Overview → Period → Details.
// `drawer: false` leaves out the Interval drawer; `url: true` keeps the layout in ?layout=.
export function mount(el: HTMLElement, { drawer = true, url = false } = {}) {
  let interval: Interval = "1M";
  let bars: Bar[] = [];
  let txns: Txn[] = [];

  el.classList.add("finance");
  el.innerHTML = `
    ${drawer ? `<aside data-sashay-drawer="overview"><p class="fi-label">Show the last</p>${INTERVALS.map((v) => `<button data-interval="${v}">${v}</button>`).join("")}</aside>` : ""}
    <section data-sashay-pane="overview">
      <header><p class="fi-label">Portfolio</p><p class="fi-value"></p><p class="fi-delta"></p></header>
      <svg class="fi-chart" preserveAspectRatio="none" role="group" aria-label="Portfolio value"></svg>
      <p class="fi-axis"></p>
    </section>
    <section data-sashay-pane="period"></section>
    <section data-sashay-pane="details"></section>`;
  const $ = (s: string) => el.querySelector(s) as HTMLElement;
  const params = new URLSearchParams(location.search);

  const sash = createSashay(el, {
    panes: [
      {
        id: "overview",
        title: "Overview",
        focus: 1 / 2,
        edge: drawer ? { drawer: { width: "9rem", title: "Interval" } } : undefined,
      },
      { id: "period", title: "Period", focus: 1 / 4 },
      { id: "details", title: "Details", focus: 1 / 4 },
    ],
    defaultLayout: [1, 1], // only Overview open
    layout: (url && params.get("layout")) || undefined,
    onChange: url
      ? (code) => {
          params.set("layout", code);
          history.replaceState(history.state, "", `?${params}`);
        }
      : undefined,
    onClose(id) {
      if (id === "period") pick(-1);
      if (id === "details") el.querySelector("[aria-current]")?.removeAttribute("aria-current");
    },
  });

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
    for (const g of el.querySelectorAll("[data-bar]"))
      g.toggleAttribute("data-picked", g.getAttribute("data-bar") === String(i));
    // While Period covers part of Overview, keep the picked bar in the visible slice.
    sash.keepInView("overview", i < 0 ? null : `calc(1.25rem + ${(i + 0.5) / bars.length} * (100% - 2.5rem))`);
    if (i < 0) return;
    const bar = bars[i];
    txns = transactions(interval, i, bar);
    const net = txns.reduce((s, t) => s + t.amount, 0);
    $('[data-sashay-pane="period"]').innerHTML = `
      <header><p class="fi-label">${interval === "1W" || interval === "1M" ? "Day" : "Period"}</p><h3>${bar.label}</h3>
      <p class="fi-sub">${txns.length} transactions · net ${money(net, true)}</p></header>
      <ul>${txns.map((t, j) => `<li><button data-txn="${j}"><span>${t.title}</span><span class="fi-amt">${money(t.amount, true)}</span></button></li>`).join("")}</ul>`;
    sash.close("details");
    sash.reveal("period");
  }

  function open(j: number) {
    const t = txns[j];
    for (const b of el.querySelectorAll("[data-txn]"))
      b.toggleAttribute("aria-current", b.getAttribute("data-txn") === String(j));
    $('[data-sashay-pane="details"]').innerHTML = `
      <header><p class="fi-label">${t.kind}</p><h3>${t.title}</h3><p class="fi-big">${money(t.amount, true)}</p></header>
      <dl><dt>Date</dt><dd>${t.date}</dd>${t.ticker ? `<dt>Holding</dt><dd>${t.ticker}</dd>` : ""}<dt>Account</dt><dd>Brokerage ··7310</dd><dt>Reference</dt><dd>${t.id}</dd></dl>
      <p class="fi-note">${t.note}</p>`;
    sash.reveal("details");
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
  return () => {
    el.removeEventListener("click", onClick);
    el.removeEventListener("keydown", onKey);
    sash.destroy();
    el.classList.remove("finance");
    el.innerHTML = "";
  };
}
