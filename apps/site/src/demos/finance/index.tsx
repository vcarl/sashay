import { type Length, Pane, Sashay, type SashayHandle } from "@vcarl/sashay/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Bar, INTERVALS, type Interval, money, series, type Txn, transactions } from "./data";
import "./finance.css";

// A fixed workspace of three panes: Overview → Period → Details.
// The Guide grows it one step at a time: `drawer` adds the Interval drawer, `compactBelow` is
// passed straight through, and `initial` opens it on a layout, a period, a transaction or the drawer.
// `onUrl` gets the app's URL (layout, period, transaction) whenever it changes.
// The `#region` comments mark the excerpts the Guide shows.
type Initial = { layout?: string; period?: number; txn?: number; drawerOpen?: boolean };
export type FinanceProps = {
  drawer?: boolean;
  compactBelow?: Length;
  initial?: Initial;
  onUrl?: (url: string) => void;
};

export function Finance({
  drawer = true,
  compactBelow,
  initial = {},
  // #region url
  onUrl = (url: string) => history.replaceState(history.state, "", url),
  // #endregion
}: FinanceProps) {
  const [interval, setInterval] = useState<Interval>("1M");
  const [picked, setPicked] = useState(initial.period ?? -1);
  const [current, setCurrent] = useState(initial.txn ?? -1);
  const bars = series(interval);
  const txns = picked < 0 ? [] : transactions(interval, picked, bars[picked]);

  // #region frame
  const sash = useRef<SashayHandle>(null);
  const pick = (i: number) => {
    setPicked(i);
    setCurrent(-1);
    if (i < 0) return; // Period was closed
    sash.current?.close("details");
    sash.current?.reveal("period");
  };
  const open = (j: number) => {
    setCurrent(j);
    sash.current?.reveal("details");
  };
  // #endregion
  const range = (v: Interval) => {
    setInterval(v);
    setPicked(-1);
    setCurrent(-1);
    sash.current?.close("details");
    sash.current?.close("period");
  };

  // #region url
  const saveToUrl = (layout = sash.current?.layout ?? "") => {
    const params = new URLSearchParams({ layout });
    if (picked >= 0) params.set("period", bars[picked].label.toLowerCase().replace(/\W+/g, "-"));
    if (current >= 0) params.set("txn", txns[current].id);
    onUrl(`?${params}`);
  };
  useEffect(() => saveToUrl()); // after each render: a new period or transaction
  // #endregion

  // Open on the step the Guide asks for: a period, a transaction, a layout, the drawer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount
  useLayoutEffect(() => {
    const h = sash.current as SashayHandle;
    if (initial.period !== undefined) h.reveal("period");
    if (initial.txn !== undefined) h.reveal("details");
    if (initial.layout) h.setLayout(initial.layout); // reveal() may have moved the dividers
    if (initial.drawerOpen) h.toggleDrawer("overview", true);
  }, []);

  // #region drawer
  // The drawer's content is part of the edge that opens it.
  const intervals = (
    <>
      <p className="fi-label">Show the last</p>
      {INTERVALS.map((v) => (
        <button
          key={v}
          type="button"
          data-interval={v}
          aria-pressed={v === interval}
          onClick={() => v !== interval && range(v)}
        >
          {v}
        </button>
      ))}
    </>
  );
  // #endregion

  return (
    // #region frame
    <Sashay
      ref={sash}
      className="finance"
      defaultLayout={[1, 1]} // only Overview open
      // #region url
      layout={initial.layout} // a saved code, say from new URLSearchParams(location.search)
      onLayoutChange={saveToUrl}
      // #endregion
      // #region compact
      compactBelow={compactBelow} // a Length; "40rem" when left out
      // #endregion
    >
      <Pane
        id="overview"
        title="Overview"
        focus={1 / 2}
        // While Period covers part of Overview, keep the picked bar in the visible slice.
        keepInView={picked < 0 ? null : `calc(1.25rem + ${(picked + 0.5) / bars.length} * (100% - 2.5rem))`}
        // #region drawer
        edge={drawer ? { drawer: { width: "9rem", title: "Interval", content: intervals } } : undefined}
        // #endregion
      >
        <Overview interval={interval} bars={bars} picked={picked} onPick={pick} />
      </Pane>
      <Pane id="period" title="Period" focus={1 / 4} onClose={() => pick(-1)}>
        <Period interval={interval} bar={bars[picked]} txns={txns} current={current} onOpen={open} />
      </Pane>
      <Pane id="details" title="Details" focus={1 / 4} onClose={() => setCurrent(-1)}>
        <Details txn={txns[current]} />
      </Pane>
    </Sashay>
    // #endregion
  );
}

function Overview({
  interval,
  bars,
  picked,
  onPick,
}: {
  interval: Interval;
  bars: Bar[];
  picked: number;
  onPick: (i: number) => void;
}) {
  const lo = Math.min(...bars.map((b) => b.value)) * 0.97;
  const hi = Math.max(...bars.map((b) => b.value));
  const last = bars[bars.length - 1].value;
  const delta = last - bars[0].value;
  return (
    <>
      <header>
        <p className="fi-label">Portfolio</p>
        <p className="fi-value">{money(last)}</p>
        <p className="fi-delta">{`${money(delta, true)} (${((delta / bars[0].value) * 100).toFixed(1)}%) · ${interval}`}</p>
      </header>
      {/* biome-ignore lint/a11y/useSemanticElements: an SVG group of bars, not a form fieldset */}
      <svg
        className="fi-chart"
        preserveAspectRatio="none"
        role="group"
        aria-label="Portfolio value"
        viewBox={`0 0 ${bars.length} 100`}
      >
        {bars.map((b, i) => {
          const h = 4 + ((b.value - lo) / (hi - lo)) * 96;
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG bar can't be a <button>
            <g
              key={b.label}
              data-bar={i}
              data-picked={i === picked ? "" : undefined}
              tabIndex={0}
              role="button"
              aria-label={`${b.label}: ${money(b.value)}`}
              onClick={() => onPick(i)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onPick(i);
              }}
            >
              <rect x={i} width="1" height="100" fill="transparent" />
              <rect x={i + 0.14} y={100 - h} width="0.72" height={h} />
            </g>
          );
        })}
      </svg>
      <p className="fi-axis">
        <span>{bars[0].label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </p>
    </>
  );
}

function Period(p: { interval: Interval; bar?: Bar; txns: Txn[]; current: number; onOpen: (j: number) => void }) {
  if (!p.bar) return <p className="fi-empty">Pick a bar to see its transactions.</p>;
  const net = p.txns.reduce((s, t) => s + t.amount, 0);
  return (
    <>
      <header>
        <p className="fi-label">{p.interval === "1W" || p.interval === "1M" ? "Day" : "Period"}</p>
        <h3>{p.bar.label}</h3>
        <p className="fi-sub">{`${p.txns.length} transactions · net ${money(net, true)}`}</p>
      </header>
      <ul>
        {p.txns.map((t, j) => (
          <li key={t.id}>
            <button type="button" data-txn={j} aria-current={j === p.current || undefined} onClick={() => p.onOpen(j)}>
              <span>{t.title}</span>
              <span className="fi-amt">{money(t.amount, true)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Details({ txn: t }: { txn?: Txn }) {
  if (!t) return <p className="fi-empty">Pick a transaction.</p>;
  return (
    <>
      <header>
        <p className="fi-label">{t.kind}</p>
        <h3>{t.title}</h3>
        <p className="fi-big">{money(t.amount, true)}</p>
      </header>
      <dl>
        <dt>Date</dt>
        <dd>{t.date}</dd>
        {t.ticker && (
          <>
            <dt>Holding</dt>
            <dd>{t.ticker}</dd>
          </>
        )}
        <dt>Account</dt>
        <dd>Brokerage ··7310</dd>
        <dt>Reference</dt>
        <dd>{t.id}</dd>
      </dl>
      <p className="fi-note">{t.note}</p>
    </>
  );
}
