import { type Length, Pane, Sashay, type SashayHandle } from "@vcarl/sashay/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Facing, MAX_LIGHT, MAX_WATER, neighbours, PLANTS, type Plant, WINDOWS } from "./data";
import "./plants.css";

// A fixed workspace of three panes: Chart → Nearby → Plant.
// The Guide grows it one step at a time: `drawer` adds the Window drawer, `compactBelow` is
// passed straight through, and `initial` opens it on a layout, a plant, its card or the drawer.
// `onUrl` gets the app's URL (layout, plant) whenever it changes.
// The `#region` comments mark the excerpts the Guide shows.
type Initial = { layout?: string; plant?: string; card?: boolean; drawerOpen?: boolean };
export type PlantsProps = {
  drawer?: boolean;
  compactBelow?: Length;
  initial?: Initial;
  onUrl?: (url: string) => void;
};

// The chart is a fixed 720×440 px. It never resizes; a narrow pane crops it.
const W = 720;
const H = 440;
const PAD = 20; // the pane's padding, in plants.css
const sx = (light: number) => 44 + (light / MAX_LIGHT) * (W - 68);
const sy = (water: number) => 16 + (1 - water / MAX_WATER) * (H - 56);
const byId = (id?: string | null) => PLANTS.find((p) => p.id === id);

export function Plants({
  drawer = true,
  compactBelow,
  initial = {},
  // #region url
  onUrl = (url: string) => history.replaceState(history.state, "", url),
  // #endregion
}: PlantsProps) {
  const [facing, setFacing] = useState<Facing | null>(null);
  const [plant, setPlant] = useState(() => byId(initial.plant));

  // #region frame
  const sash = useRef<SashayHandle>(null);
  const pick = (p: Plant) => {
    if (p === plant) return sash.current?.reveal("plant"); // a second click opens its card
    setPlant(p);
    sash.current?.reveal("nearby");
  };
  // #endregion

  // #region url
  const saveToUrl = (layout = sash.current?.layout ?? "") => {
    const params = new URLSearchParams({ layout });
    if (plant) params.set("plant", plant.id);
    onUrl(`?${params}`);
  };
  useEffect(() => saveToUrl()); // after each render: a new plant
  // #endregion

  // Open on the step the Guide asks for: a plant, its card, a layout, the drawer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount
  useLayoutEffect(() => {
    const h = sash.current as SashayHandle;
    if (initial.plant) h.reveal("nearby");
    if (initial.card) h.reveal("plant");
    if (initial.layout) h.setLayout(initial.layout); // reveal() may have moved the dividers
    if (initial.drawerOpen) h.toggleDrawer("chart", true);
  }, []);

  // #region drawer
  // The drawer's content is part of the edge that opens it.
  const windows = (
    <>
      <p className="pl-drawer-title">Your window faces</p>
      {(Object.keys(WINDOWS) as Facing[]).map((f) => (
        <button
          key={f}
          type="button"
          data-facing={f}
          aria-pressed={f === facing}
          onClick={() => setFacing(f === facing ? null : f)}
        >
          {f}
        </button>
      ))}
    </>
  );
  // #endregion

  return (
    // #region frame
    <Sashay
      ref={sash}
      className="plants"
      defaultLayout={[1, 1]} // only the chart open
      // #region url
      layout={initial.layout} // a saved code, say from new URLSearchParams(location.search)
      onLayoutChange={saveToUrl}
      // #endregion
      // #region compact
      compactBelow={compactBelow} // a Length; "40rem" when left out
      // #endregion
    >
      <Pane
        id="chart"
        title="Chart"
        // #region keep
        focus={3 / 4} // covered, the chart is still drawn this wide, room for all 720px
        // The picked plant's x, in px from the pane's left. While Nearby covers part of the
        // chart, sashay slides the chart left just enough to keep that point showing.
        keepInView={plant ? PAD + sx(plant.light) : null}
        // #endregion
        // #region drawer
        edge={drawer ? { drawer: { width: "9rem", title: "Window", content: windows } } : undefined}
        // #endregion
      >
        <Chart plant={plant} facing={facing} onPick={pick} />
      </Pane>
      <Pane id="nearby" title="Nearby" focus={1 / 4} onClose={() => setPlant(undefined)}>
        <Nearby plant={plant} onPick={pick} />
      </Pane>
      <Pane id="plant" title="Plant" focus={1 / 4} opensTo={[1 / 3, 2 / 3]}>
        <Card plant={plant} />
      </Pane>
    </Sashay>
    // #endregion
  );
}

function Chart({ plant, facing, onPick }: { plant?: Plant; facing: Facing | null; onPick: (p: Plant) => void }) {
  const [hover, setHover] = useState<Plant>();
  const sun = facing ? WINDOWS[facing] : MAX_LIGHT;
  // The picked plant draws last, so it sits on top.
  const dots = plant ? [...PLANTS.filter((p) => p !== plant), plant] : PLANTS;
  return (
    <>
      <h3>Houseplants</h3>
      <p className="pl-sub">
        {facing
          ? `Hollow dots need more sun than a ${facing.toLowerCase()} window gives.`
          : "Sun against water. Pick a plant."}
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: an SVG group of points, not a form fieldset */}
      <svg className="pl-chart" width={W} height={H} role="group" aria-label="Houseplants by sun and water">
        {facing && (
          <rect className="pl-sun" x={sx(0)} y={sy(MAX_WATER)} width={sx(sun) - sx(0)} height={sy(0) - sy(MAX_WATER)} />
        )}
        {[0, 2, 4, 6, 8, 10].map((l) => (
          <g key={`x${l}`} className="pl-tick">
            <line x1={sx(l)} x2={sx(l)} y1={sy(0)} y2={sy(MAX_WATER)} />
            <text x={sx(l)} y={sy(0) + 18} textAnchor="middle">
              {l}
            </text>
          </g>
        ))}
        {[0, 3, 6, 9, 12].map((w) => (
          <g key={`y${w}`} className="pl-tick">
            <line x1={sx(0)} x2={sx(MAX_LIGHT)} y1={sy(w)} y2={sy(w)} />
            <text x={sx(0) - 10} y={sy(w) + 4} textAnchor="end">
              {w}
            </text>
          </g>
        ))}
        <text className="pl-axis" x={sx(MAX_LIGHT)} y={H - 4} textAnchor="end">
          Hours of direct sun →
        </text>
        <text className="pl-axis" x={-sy(MAX_WATER)} y={12} transform="rotate(-90)" textAnchor="end">
          Waterings a month →
        </text>
        {dots.map((p) => (
          // biome-ignore lint/a11y/useSemanticElements: an SVG point can't be a <button>
          <g
            key={p.id}
            data-dot={p.id}
            data-picked={p === plant ? "" : undefined}
            data-hollow={p.light > sun ? "" : undefined}
            tabIndex={0}
            role="button"
            aria-pressed={p === plant}
            aria-label={`${p.name}: ${p.light} hours of sun, ${p.water} waterings a month`}
            transform={`translate(${sx(p.light)} ${sy(p.water)})`}
            onClick={() => onPick(p)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onPick(p);
            }}
            onPointerEnter={() => setHover(p)}
            onPointerLeave={() => setHover(undefined)}
          >
            <circle r="13" fill="transparent" />
            <circle r={p === plant ? 9 : 6} />
          </g>
        ))}
        {[plant, hover].map(
          (p, i) =>
            p &&
            (i === 0 || p !== plant) && (
              // Names sit to the left of their dot, so a squeezed chart still shows them.
              <text
                key={p.id}
                className="pl-name"
                x={sx(p.light) + (p.light > 2 ? -14 : 14)}
                y={sy(p.water) - 10}
                textAnchor={p.light > 2 ? "end" : "start"}
              >
                {p.name}
              </text>
            ),
        )}
      </svg>
    </>
  );
}

function Nearby({ plant, onPick }: { plant?: Plant; onPick: (p: Plant) => void }) {
  if (!plant) return <p className="pl-sub">Pick a plant on the chart.</p>;
  return (
    <>
      <h3>Near {plant.name}</h3>
      <p className="pl-sub">Closest in sun and water first.</p>
      <ul>
        {neighbours(plant).map((p) => (
          <li key={p.id}>
            <button type="button" data-row={p.id} aria-current={p === plant || undefined} onClick={() => onPick(p)}>
              <span className="pl-row-name">{p.name}</span>
              <span className="pl-num">{p === plant ? "Details ›" : `${p.light}h · ${p.water}/mo`}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Card({ plant: p }: { plant?: Plant }) {
  if (!p) return <p className="pl-sub">Pick a plant.</p>;
  return (
    <>
      <Pot cactus={p.water <= 2} />
      <h3>{p.name}</h3>
      <dl>
        <dt>Sun</dt>
        <dd>{p.light} hours a day</dd>
        <dt>Water</dt>
        <dd>{p.water} times a month</dd>
      </dl>
      <p className="pl-note">{p.note}</p>
    </>
  );
}

// A flat pot: a cactus for the dry-lovers, leaves for the rest.
function Pot({ cactus }: { cactus: boolean }) {
  return (
    <svg className="pl-pot" viewBox="0 0 120 110" aria-hidden="true">
      {cactus ? (
        <>
          <path d="M46 56H36a14 14 0 0 1-14-14V34a6 6 0 0 1 12 0v10h12Z" className="pl-leaf" />
          <path d="M74 48h10V30a6 6 0 0 1 12 0v16a14 14 0 0 1-14 14h-8Z" className="pl-leaf" />
          <rect x="44" y="16" width="32" height="64" rx="16" className="pl-leaf" />
        </>
      ) : (
        <>
          <path d="M60 74C36 66 26 44 30 22c18 6 28 26 30 52Z" className="pl-leaf" />
          <path d="M60 74C84 66 94 44 90 22 72 28 62 48 60 74Z" className="pl-leaf" />
          <path d="M60 74C52 52 54 26 60 8c6 18 8 44 0 66Z" className="pl-leaf" />
        </>
      )}
      <path d="M32 72h56l-7 34H39Z" className="pl-pot-body" />
      <rect x="28" y="68" width="64" height="10" rx="2" className="pl-pot-body" />
    </svg>
  );
}
