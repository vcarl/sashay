// The server's first paint against the hydrated frame: every part, in the same place.
import { act, type ReactNode, StrictMode, Suspense, use, useLayoutEffect } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToReadableStream, renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "../src/sashay.css";
import { Pane, type PaneProps, Sashay, type SashayProps } from "./react.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root | undefined;
beforeEach(() => {
  host = document.body.appendChild(document.createElement("div"));
  document.documentElement.style.fontSize = "16px";
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  host.remove();
});

const PARTS = ["pane", "edge", "bar", "bar-toggle", "spine-tab", "tab", "close", "tabs", "dots"];
const ATTRS = ["role", "aria-pressed", "aria-expanded"];
// What shows, where. A closed pane is covered by its neighbours, so it doesn't show.
function parts(): string[] {
  const f = host.querySelector("[data-sashay-frame]") as HTMLElement;
  const o = f.getBoundingClientRect();
  return PARTS.flatMap((p) => [...f.querySelectorAll<HTMLElement>(`[data-sashay-${p}]`)])
    .concat([...f.querySelectorAll<HTMLElement>("[data-spine]")])
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // A part in a hidden spine or strip has no box; a tab scrolled out of its spine doesn't show.
      const shows = r.width > 0 && s.visibility === "visible" && s.display !== "none" && r.bottom > o.top;
      return shows && !el.hasAttribute("data-closed") && r.left < o.right && r.top < o.bottom;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const name = [...el.attributes]
        .filter((a) => /^data-(sashay-(?!frame)\w|spine)/.test(a.name) || ATTRS.includes(a.name))
        .map((a) => `${a.name}=${a.value}`);
      const z = el.dataset.sashayEdge ? "" : getComputedStyle(el).zIndex; // a stand-in edge differs: it is later in the DOM
      const box = [r.left - o.left, r.top - o.top, r.width, r.height].map((x) => Math.round(x));
      return `${name.sort().join(" ")} @ ${box} z${z}`;
    })
    .sort();
}

// A spine scrolls by whole pixels, the first paint doesn't: its tabs may be a pixel apart.
const SPINE_TOP = /^(data-sashay-spine-tab=.* @ -?\d+,)(-?\d+)/;
function expectSame(got: string[], first: string[], message: string) {
  const rest = (list: string[]) => list.map((x) => x.replace(SPINE_TOP, "$1"));
  const tops = (list: string[]) => list.map((x) => Number(SPINE_TOP.exec(x)?.[2] ?? 0));
  expect(rest(got), message).toEqual(rest(first));
  const want = tops(first);
  tops(got).forEach((y, i) => void expect(Math.abs(y - want[i]), message).toBeLessThanOrEqual(1));
}

const bar = { title: "Bar", content: "bar", height: 200 };
const P = (ids: string, more: (k: number) => Partial<PaneProps> = () => ({})): PaneProps[] =>
  [...ids].map((id, k) => ({ id, title: `Pane ${id}`, focus: 1 / 3, ...more(k) }));
const App = ({ panes, extra, ...props }: SashayProps & { panes: PaneProps[]; extra?: ReactNode }) => (
  <Sashay {...props} style={{ height: 500 }}>
    {panes.map((p) => (
      <Pane key={p.id} {...p}>
        <p>{p.title}</p>
      </Pane>
    ))}
    {extra}
  </Sashay>
);

const CASES: [string, SashayProps & { panes: PaneProps[] }][] = [
  ["default split", { panes: P("abc") }],
  ["default split, minimums", { panes: P("abcd", (k) => ({ minWidth: k % 2 ? "14rem" : 150 })) }],
  ["deep default, minimums", { panes: P("abcdefghi", () => ({ minWidth: "12rem", bar })) }],
  ["defaultLayout", { panes: P("abc"), defaultLayout: [0.5, 0.75] }],
  ["layout with covered panes", { panes: P("abc", () => ({ focus: 0.6 })), layout: "48" }],
  ["closed panes", { panes: P("abc"), layout: "0c" }],
  ["bars, one open", { panes: P("abc", () => ({ bar })), layout: "48.2" }],
  ["a bar open in a closed pane", { panes: P("abc", () => ({ bar })), layout: "4c.5" }],
  ["spines at both ends, bars in spined panes", { panes: P("abcdefgh", () => ({ bar })), layout: "3-48.4" }],
  ["a long spine", { panes: P("abcdefghijklmnopqrstuvwxyz"), layout: "23-48" }],
  ["edge widths", { panes: P("abc", (k) => ({ edge: { width: k ? "2rem" : 5 } })), layout: "69" }],
  ["always compact", { panes: P("abc", () => ({ bar })), layout: "48.1", compactBelow: "200vw" }],
  ["compactBelow in px", { panes: P("abc"), compactBelow: 900 }],
  ["escaped ids and titles", { panes: P(`"<&`, () => ({ title: '</style><b x="', bar })), layout: "48.0" }],
  ["compactLayout", { panes: P("abc", () => ({ bar })), defaultLayout: [0.5, 0.75], compactLayout: [1, 1] }],
  ["compactLayout, default split", { panes: P("abcde", () => ({ minWidth: "9rem" })), compactLayout: [0, 1, 1, 1] }],
  ["compactLayout, eight panes", { panes: P("abcdefgh"), compactLayout: [0, 0, 0, 0, 0, 0, 1] }],
  ["compactLayout, invalid layout", { panes: P("abc"), layout: "zzz", compactLayout: [0, 0] }],
  ["compactLayout, valid layout", { panes: P("abc"), layout: "48", compactLayout: [0, 0] }],
  ["one pane", { panes: P("a") }],
];
const settle = () => act(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

for (const [name, props] of CASES)
  test(`first paint matches: ${name}`, async () => {
    for (const width of [300, 390, 520, 600, 639, 641, 700, 820, 900, 1010, 1200, 1440, 1500]) {
      host.style.width = `${width}px`;
      host.innerHTML = renderToString(
        <StrictMode>
          <App {...props} />
        </StrictMode>,
      );
      const first = parts();
      expect(first.length).toBeGreaterThan(0);
      expect(host.querySelectorAll("[data-sashay-ssr-ui] [id]")).toHaveLength(0);
      const error = vi.spyOn(console, "error");
      const recover = vi.fn();
      await act(async () => {
        root = hydrateRoot(
          host,
          <StrictMode>
            <App {...props} />
          </StrictMode>,
          { onRecoverableError: recover },
        );
      });
      expectSame(parts(), first, `${width}px, hydrated`);
      await settle();
      expect(host.querySelector("[data-sashay-ssr-ui]")).toBeNull();
      expectSame(parts(), first, `${width}px, settled`);
      expect(recover).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
      await act(() => root?.unmount());
      root = undefined;
    }
  });

test("hydration leaves no stand-ins, even before the first frame", async () => {
  host.innerHTML = renderToString(<App panes={P("abc")} />);
  const stand = host.querySelector("[data-sashay-ssr-ui]") as HTMLElement;
  expect(stand.inert).toBe(true);
  await act(async () => {
    root = hydrateRoot(host, <App panes={P("abc")} />);
  });
  expect(host.querySelectorAll("[data-sashay-edge]")).toHaveLength(3);
});

function Probe({ seen }: { seen: (n: number) => void }) {
  useLayoutEffect(() => seen(host.querySelectorAll("[data-sashay-ssr-ui]").length), [seen]);
  return null;
}
test("a client render has no stand-ins", async () => {
  const seen = vi.fn();
  root = createRoot(host);
  await act(() => root?.render(<App panes={P("abc")} extra={<Probe seen={seen} />} />));
  expect(seen).toHaveBeenCalledWith(0);
});

test("a Suspense boundary around a pane hydrates without errors", async () => {
  const app = (
    <App
      panes={P("ab")}
      layout="48"
      extra={
        <Suspense>
          <Pane id="c" title="Pane c" focus={1 / 3} />
        </Suspense>
      }
    />
  );
  host.style.width = "960px";
  host.innerHTML = renderToString(app);
  const error = vi.spyOn(console, "error");
  const recover = vi.fn();
  await act(async () => {
    root = hydrateRoot(host, app, { onRecoverableError: recover });
  });
  await settle();
  expect(recover).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test("nonce goes to the inline style, not the frame", () => {
  const html = renderToString(<App panes={P("abc")} nonce="n1" />);
  expect(html).toMatch(/<style nonce="n1">/);
  expect(html.match(/nonce=/g)).toHaveLength(1);
  expect(html.replace(/<div style="height:500px"/, "")).not.toContain(" style="); // a strict style-src blocks it
});

const Slow = ({ text }: { text: Promise<string> }) => <p>{use(text)}</p>;
// Last: a server render left open confuses React's check for two renderers sharing a context.
test("a pane whose content suspends while streaming doesn't change the first paint", async () => {
  let done = (_: string) => {};
  const slow = new Promise<string>((r) => {
    done = r;
  });
  const app = (
    <Sashay layout="48" style={{ height: 500 }}>
      <Pane id="a" title="A" focus={1 / 3}>
        <Suspense fallback={<p>wait</p>}>
          <Slow text={slow} />
        </Suspense>
      </Pane>
      <Pane id="b" title="B" focus={1 / 3} />
      <Pane id="c" title="C" focus={1 / 3} />
    </Sashay>
  );
  host.style.width = "960px";
  const reader = (await renderToReadableStream(app)).getReader();
  const decoder = new TextDecoder();
  let html = "";
  const end = reader.read().then(function next(r): unknown {
    html += decoder.decode(r.value, { stream: true });
    return r.done || reader.read().then(next);
  });
  await new Promise((r) => setTimeout(r, 100));
  host.innerHTML = html; // the shell
  const first = parts();
  expect(host.textContent).toContain("wait");
  expect(first.filter((x) => x.includes("sashay-edge"))).toHaveLength(3);
  expect(first.filter((x) => x.includes("sashay-pane"))).toHaveLength(3);
  done("ready");
  await end;
  expect(html).toContain("ready");
});

test("stand-in controls are never a form's default button", () => {
  host.innerHTML = renderToString(
    <form>
      <App panes={P("abcdefgh", () => ({ bar }))} layout="3-48.4" />
      <button type="submit">Send</button>
    </form>,
  );
  expect([...host.querySelectorAll("button")].filter((b) => b.type === "submit").map((b) => b.textContent)).toEqual([
    "Send",
  ]);
});

test("without JS, a frame with panes out of reach is a row that scrolls, bars under their panes", () => {
  for (const [width, layout] of [
    [300, "48.0"],
    [1200, "2-48.0"],
    [1200, "0c.0"],
  ] as const) {
    host.style.width = `${width}px`;
    const panes = P(layout[1] === "-" ? "abcde" : "abc", (k) => (k ? { bar } : {}));
    host.innerHTML = renderToString(<App panes={panes} layout={layout} />).replaceAll("(scripting: none)", "all");
    const f = host.querySelector("[data-sashay-frame]") as HTMLElement;
    const all = [...f.querySelectorAll<HTMLElement>("[data-sashay-pane]")];
    const box = (el: Element) => el.getBoundingClientRect();
    all.forEach((el, k) => {
      const r = box(el);
      expect(getComputedStyle(el).visibility).toBe("visible");
      expect(r.top).toBe(box(f).top);
      expect(r.width).toBeGreaterThan(100);
      if (k) expect(r.left).toBeGreaterThanOrEqual(box(all[k - 1]).right);
      const b = f.querySelector(`[data-sashay-bar="${el.dataset.sashayPane}"]`);
      if (!b) {
        expect(r.bottom).toBe(box(f).bottom);
        return;
      }
      expect(getComputedStyle(b).visibility).toBe("visible");
      expect([box(b).left, box(b).width, box(b).bottom]).toEqual([r.left, r.width, box(f).bottom]);
      expect(r.bottom).toBe(box(b).top);
    });
    const last = box(all[all.length - 1]).right - box(f).left;
    expect(f.scrollWidth).toBeGreaterThanOrEqual(Math.floor(last)); // reachable by scrolling
    expect(getComputedStyle(f).overflowX).toBe("auto");
    expect(box(f.querySelector("[data-sashay-ssr-ui]") as Element).width).toBe(0);
  }
});
