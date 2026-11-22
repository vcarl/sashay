import { act, type ReactNode, StrictMode, useState } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tx } from "../test/dom.ts";
import { Pane, type PaneProps, Sashay, type SashayHandle, type SashayProps } from "./react.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const P3: PaneProps[] = [
  { id: "a", title: "A", focus: 0.3, minWidth: "180px" },
  { id: "b", title: "B", focus: 0.25, minWidth: "150px" },
  { id: "c", title: "C", focus: 1 / 3, minWidth: "180px" },
];

let host: HTMLElement;
let root: Root | undefined;
const P = (id: string) => host.querySelector(`[data-sashay-pane="${id}"]`) as HTMLElement;

beforeEach(() => {
  document.documentElement.style.fontSize = "16px";
  host = document.body.appendChild(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  host.remove();
});

const App = ({ panes = P3, extra, ...props }: SashayProps & { panes?: PaneProps[]; extra?: ReactNode }) => (
  <Sashay style={{ width: 960, height: 600 }} {...props}>
    {panes.map((p) => (
      <Pane key={p.id} {...p} />
    ))}
    {extra}
  </Sashay>
);

let show = (_: boolean) => {};
function Details() {
  const [on, setOn] = useState(false);
  show = setOn;
  return on ? <Pane id="d" title="D" focus={1 / 3} /> : null;
}
let add = () => {};
const stackSpy = vi.fn();
function Stack() {
  const [code, setCode] = useState("48");
  const [panes, setPanes] = useState(P3);
  add = () => setPanes([...P3, { id: "d", title: "D", focus: 1 / 3 }]);
  return (
    <App
      panes={panes}
      layout={code}
      onLayoutChange={(c) => {
        stackSpy(c);
        setCode(c);
      }}
    />
  );
}

async function render(node: ReactNode) {
  root ??= createRoot(host);
  await act(() => root?.render(node));
}

test("renders and paints", async () => {
  const h = { current: null as SashayHandle | null };
  const spy = vi.fn();
  await render(<App ref={h} layout="48" onLayoutChange={spy} />);
  expect(tx(P("b"))).toBeCloseTo(332, 1);
  await act(() => h.current?.close("c"));
  expect(spy).toHaveBeenCalledWith("4c");
});

test("wrapped, conditional pane", async () => {
  const spy = vi.fn();
  await render(<App layout="48" onLayoutChange={spy} extra={<Details />} />);
  await act(async () => show(true));
  expect(spy.mock.lastCall?.[0]).toMatch(/^[0-9a-c]{3}$/);
  expect(Number.isFinite(tx(P("d")))).toBe(true);
});

test("stale layout prop doesn't undo a list change", async () => {
  const spy = stackSpy;
  await render(<Stack />);
  await act(async () => add());
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0]).toMatch(/^[0-9a-c]{3}$/);
  for (const id of "abcd") expect(Number.isFinite(tx(P(id)))).toBe(true);
  expect(P("d").hasAttribute("data-closed")).toBe(false);
});

test("layout prop applies", async () => {
  const spy = vi.fn();
  await render(<App layout="48" onLayoutChange={spy} />);
  await render(<App layout="69" onLayoutChange={spy} />);
  expect(tx(P("c"))).toBeCloseTo(0.75 * 924 + 36, 1);
  expect(spy).not.toHaveBeenCalled();
});

test("per-pane onClose", async () => {
  const onClose = vi.fn();
  await render(<App layout="48" panes={[P3[0], P3[1], { ...P3[2], onClose }]} />);
  await act(() => (host.querySelector("[data-sashay-close]") as HTMLElement).click());
  expect(onClose).toHaveBeenCalledOnce();
});

test("render-prop offscreen", async () => {
  const panes = Array.from({ length: 6 }, (_, k) => ({
    id: `p${k}`,
    title: `P${k}`,
    focus: 1 / 3,
    children: ({ offscreen }: { offscreen: boolean }) => (offscreen ? "zzz" : "awake"),
  }));
  await render(<App layout="3-48" panes={panes} />);
  await vi.waitFor(() => expect(P("p0").textContent).toBe("zzz"));
  expect(P("p5").textContent).toBe("awake");
});

test("drawer content renders into the drawer element", async () => {
  const drawer = { width: "10rem", title: "Notes", content: <b>notes</b> };
  await render(<App layout="48" panes={[P3[0], { ...P3[1], edge: { drawer } }, P3[2]]} />);
  expect(host.querySelector('[data-sashay-drawer="b"]')?.innerHTML).toBe("<b>notes</b>");
});

test("SSR first paint matches", async () => {
  const html = renderToString(<App layout="48" />);
  host.innerHTML = html;
  const box = () => {
    const f = host.firstElementChild?.getBoundingClientRect() as DOMRect;
    const b = P("b").getBoundingClientRect();
    return { left: b.left - f.left, width: b.width };
  };
  expect(box().left).toBeCloseTo(332, 0);
  expect(box().width).toBeCloseTo(308, 0);
  const spy2 = vi.fn();
  await act(async () => {
    root = hydrateRoot(host, <App layout="48" />, { onRecoverableError: spy2 });
  });
  expect(spy2).not.toHaveBeenCalled();
  expect(host.firstElementChild?.hasAttribute("data-sashay-ready")).toBe(true);
  expect(box().left).toBeCloseTo(332, 0);
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  expect(host.querySelector("style")).toBeNull();
  expect(box().left).toBeCloseTo(332, 0);
});

test("StrictMode", async () => {
  await render(
    <StrictMode>
      <App layout="48" />
    </StrictMode>,
  );
  expect(tx(P("b"))).toBeCloseTo(332, 1);
  expect(host.querySelectorAll("[data-sashay-close]")).toHaveLength(1);
});
