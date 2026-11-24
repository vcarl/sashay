import { Pane, Sashay, type SashayHandle } from "@vcarl/sashay/react";
import { useLayoutEffect, useRef, useState } from "react";

const edge = { width: 32 }; // --edge, as a length the server can use in a container query
const MAX = 12; // added panes

/** `?panes=`, untrusted: the number of added panes, or 0 for anything malformed. */
const paneCount = (param: string | null): number => (/^\d{1,3}$/.test(param ?? "") ? Math.min(Number(param), MAX) : 0);

// What this visit starts from. The page is prerendered, so the server has only the default.
function start(): { count: number; layout?: string } {
  if (typeof location === "undefined") return { count: 0 };
  const params = new URLSearchParams(location.search);
  return { count: paneCount(params.get("panes")), layout: params.get("layout") ?? undefined };
}

export function Hero({ base }: { base: string }) {
  const [init] = useState(start);
  const h = useRef<SashayHandle>(null);
  // Added panes, left to right. They are numbered by position, so removing one in the middle
  // renumbers the rest and the URL needs only the count.
  const [added, setAdded] = useState<number[]>([]);
  const [code, setCode] = useState("69.0"); // what defaultLayout encodes to
  const seq = useRef(0);
  const next = useRef<{ layout?: string; count: number }>(undefined); // a layout to apply once the panes are in place
  const add = (n = 1) => {
    const ids = Array.from({ length: n }, () => ++seq.current);
    setAdded((a) => [...a, ...ids]);
  };
  const show = (layout: string) => {
    setCode(layout);
    const url = new URL(location.href);
    url.searchParams.set("layout", layout);
    if (added.length) url.searchParams.set("panes", String(added.length));
    else url.searchParams.delete("panes");
    history.replaceState(history.state, "", url);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on load
  useLayoutEffect(() => {
    if (!init.count) return;
    next.current = init;
    add(init.count);
  }, []);
  // After every pane-list change: the count changed, whether or not the layout did.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pane list, not every render
  useLayoutEffect(() => {
    if (!h.current) return;
    if (next.current?.count === added.length) {
      h.current.setLayout(next.current.layout ?? ""); // "": the default
      next.current = undefined;
    }
    show(h.current.layout);
  }, [added]);

  return (
    <>
      <Sashay
        className="frame"
        id="hero"
        ref={h}
        layout={init.layout}
        defaultLayout={[0.5, 0.75]}
        compactLayout={[1, 1]} // a phone starts on Hello
        onLayoutChange={show}
      >
        <Pane id="hello" title="Hello" focus={0.5} edge={edge} className="pane p-hello">
          <div className="in">
            <div>
              <h1>Sashay</h1>
              <p>
                Drag the edge between two panes to resize them. The edge settles at a simple fraction of the width, and
                a pane with no room left slides under its neighbour. The layout can be saved in the URL.
              </p>
              <div className="cta">
                <a className="btn fill" href={`${base}guide/`}>
                  Read the docs
                </a>
                <a className="btn" href="https://www.npmjs.com/package/@vcarl/sashay">
                  npm i @vcarl/sashay
                </a>
              </div>
            </div>
            <div className="hint">
              <svg
                width="26"
                height="18"
                viewBox="0 0 26 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 9h24M7 3 1 9l6 6M19 3l6 6-6 6" />
              </svg>{" "}
              <span className="wide">This headline is a pane. Grab the red edge to its right.</span>
              <span className="narrow">This headline is a pane. On a phone the edges become tabs: tap one.</span>
            </div>
          </div>
        </Pane>
        <Pane id="why" title="Why" focus={0.25} edge={edge} className="pane p-why">
          <div className="in">
            <div>
              <h2>Why panes?</h2>
              <p>
                Power users want to arrange their screen the way they work. Panes give them that without making the
                interface complicated: each pane is an ordinary view, and the only new control is the edge between them.
              </p>
              <p>
                That makes them a good middle ground between a fully customisable UI, where any panel can go anywhere,
                and a simple responsive layout that decides everything for you.
              </p>
            </div>
          </div>
        </Pane>
        <Pane
          id="install"
          title="Install"
          focus={0.25}
          edge={edge}
          className="pane p-install"
          bar={{
            title: "Package",
            height: "8rem",
            content: (
              <div className="meta">
                <span>ESM only</span>
                <span>React ≥19</span>
                <span>0-dep core</span>
                <span>MIT</span>
              </div>
            ),
          }}
        >
          <div className="in">
            <div>
              <h2>Hang it in a frame.</h2>
              <pre>
                <span className="c">{"// @vcarl/sashay/react"}</span>
                {"\n<Sashay\n  onLayoutChange={save}>\n  <Pane id="}
                <span className="s">"list"</span>
                {"\n    title="}
                <span className="s">"List"</span>
                {"\n    focus={"}
                <span className="s">1/3</span>
                {"}>…</Pane>\n  <Pane id="}
                <span className="s">"detail"</span>
                {"\n    title="}
                <span className="s">"Detail"</span>
                {"\n    focus={"}
                <span className="s">1/2</span>
                {"}>…</Pane>\n</Sashay>"}
              </pre>
            </div>
          </div>
        </Pane>
        {added.map((n, i) => (
          <Pane
            key={n}
            id={`added-${n}`}
            title={`Pane ${i + 1}`}
            focus={0.25}
            minWidth="8rem"
            edge={edge}
            className={`pane p-added tint-${(n - 1) % 3}`}
            onClose={() => setAdded((a) => a.filter((x) => x !== n))}
          >
            <div className="in">
              <h2>{`Pane ${i + 1}`}</h2>
              <p>An added pane. Close it and it is removed.</p>
            </div>
          </Pane>
        ))}
      </Sashay>

      <div className="readout" id="readout">
        <span className="url">
          <span>?layout=</span>
          <span className="code">{code}</span>
        </span>
        <span className="say">This code is the layout. Drag an edge, throw it, or click one to open and close.</span>
        <button type="button" data-act="add" disabled={added.length >= MAX} onClick={() => add()}>
          Add pane
        </button>
        <button
          type="button"
          data-act="reset"
          onClick={() => {
            next.current = { count: 0 };
            setAdded([]);
          }}
        >
          Reset
        </button>
      </div>
    </>
  );
}
