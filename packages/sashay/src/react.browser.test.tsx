import { Activity, act, type ReactNode, StrictMode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
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
  expect(h.current?.layout).toBe("4c");
});

test("compactBelow returning to undefined restores the default", async () => {
  await render(<App layout="48" compactBelow="70rem" />);
  expect(host.querySelector("[data-sashay-frame]")?.hasAttribute("data-compact")).toBe(true);
  await render(<App layout="48" />);
  expect(host.querySelector("[data-sashay-frame]")?.hasAttribute("data-compact")).toBe(false);
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

test("a layout prop after ref.setLayout still applies", async () => {
  const h = { current: null as SashayHandle | null };
  await render(<App ref={h} layout="48" />);
  await act(() => h.current?.close("c")); // reports "4c"; the app doesn't feed it back
  await act(() => h.current?.setLayout("48"));
  await render(<App ref={h} layout="4c" />);
  expect(P("c").hasAttribute("data-closed")).toBe(true);
});

test("changing bar content re-renders it, and a pane's bar comes and goes", async () => {
  const at = (content?: ReactNode): PaneProps[] => [
    P3[0],
    { ...P3[1], bar: content ? { title: "N", content } : undefined },
    P3[2],
  ];
  const toggle = () => host.querySelector('[data-sashay-bar-toggle="b"]');
  const content = () => host.querySelector('[data-sashay-bar="b"]');
  await render(<App layout="48" panes={at("one")} />);
  await render(<App layout="48" panes={at("two")} />);
  expect(content()?.textContent).toBe("two");
  expect(toggle()?.textContent).toBe("N");
  await render(<App layout="48" panes={at()} />);
  expect([toggle(), content()]).toEqual([null, null]);
  await render(<App layout="48" panes={at(<b>notes</b>)} />);
  expect(content()?.innerHTML).toBe("<b>notes</b>");
  expect(toggle()).not.toBeNull();
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

test("SSR: a bar's room is kept, its content hidden unless the layout has it open", async () => {
  const panes: PaneProps[] = [
    { ...P3[0], bar: { title: "A", content: "a" } },
    { ...P3[1], bar: { title: "B", height: 200, content: "b" } },
    P3[2],
  ];
  host.innerHTML = renderToString(<App panes={panes} layout="48.2" />);
  const content = (id: string) => host.querySelector(`[data-sashay-bar="${id}"]`) as HTMLElement;
  const see = () => {
    const f = host.firstElementChild?.getBoundingClientRect() as DOMRect;
    const b = content("b").getBoundingClientRect();
    return {
      box: [b.left - f.left, b.top - f.top, b.width, b.height].map(Math.round),
      pane: P("b").getBoundingClientRect().height,
      other: P("c").getBoundingClientRect().height,
      vis: ["a", "b"].map((id) => getComputedStyle(content(id)).visibility),
    };
  };
  const first = see();
  expect(first).toEqual({ box: [332, 444, 308, 156], pane: 556, other: 600, vis: ["hidden", "visible"] });
  const recover = vi.fn();
  await act(async () => {
    root = hydrateRoot(host, <App panes={panes} layout="48.2" />, { onRecoverableError: recover });
  });
  expect(recover).not.toHaveBeenCalled();
  expect(see()).toEqual(first);
  await act(() => new Promise((r) => requestAnimationFrame(r)));
  expect(see()).toEqual(first);
});

test("StrictMode with an open bar", async () => {
  const panes: PaneProps[] = [{ ...P3[0], bar: { title: "Files", content: "files" } }, P3[1], P3[2]];
  await render(
    <StrictMode>
      <App panes={panes} layout="48.1" />
    </StrictMode>,
  );
  const toggles = host.querySelectorAll<HTMLElement>("[data-sashay-bar-toggle]");
  expect(toggles).toHaveLength(1);
  expect(toggles[0].getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById(toggles[0].getAttribute("aria-controls") ?? "")?.textContent).toBe("files");
  expect(P("a").getBoundingClientRect().height).toBe(556);
  await act(() => toggles[0].click());
  expect(toggles[0].getAttribute("aria-expanded")).toBe("false");
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

// A remount (StrictMode's second mount, Fast Refresh, a re-shown Activity or Suspense) re-registers
// every pane; the layout prop must survive it. B's x under "5c.0", as without StrictMode.
const D3: PaneProps[] = [{ ...P3[0], bar: { title: "Files", content: "files" } }, P3[1], P3[2]];
const at5c = () => {
  expect(tx(P("b"))).toBeCloseTo(332, 1);
  expect(P("c").hasAttribute("data-closed")).toBe(true);
};
test("StrictMode keeps a non-default initial layout", async () => {
  const h = { current: null as SashayHandle | null };
  const spy = vi.fn();
  await render(
    <StrictMode>
      <App ref={h} panes={D3} layout="5c.0" onLayoutChange={spy} />
    </StrictMode>,
  );
  expect(h.current?.layout).toBe("5c.0");
  at5c();
  expect(spy).not.toHaveBeenCalled();
  await render(
    <StrictMode>
      <App ref={h} panes={D3} layout="48.0" onLayoutChange={spy} />
    </StrictMode>,
  );
  expect(h.current?.layout).toBe("48.0");
  expect(P("c").hasAttribute("data-closed")).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

test("a remount that keeps state (Fast Refresh, re-shown Activity) keeps the layout", async () => {
  const h = { current: null as SashayHandle | null };
  const spy = vi.fn();
  const at = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <App ref={h} panes={D3} layout="5c.0" onLayoutChange={spy} />
    </Activity>
  );
  await render(at("visible"));
  await render(at("hidden"));
  await render(at("visible"));
  expect(h.current?.layout).toBe("5c.0");
  at5c();
  expect(spy).not.toHaveBeenCalled();
});

test("a layout prop, or panes, changed while hidden apply when the frame is shown again", async () => {
  const h = { current: null as SashayHandle | null };
  const at = (mode: "visible" | "hidden", layout: string, panes = P3) => (
    <Activity mode={mode}>
      <App ref={h} panes={panes} layout={layout} />
    </Activity>
  );
  await render(at("visible", "5c"));
  await render(at("hidden", "5c"));
  await render(at("hidden", "48"));
  await render(at("visible", "48"));
  expect(h.current?.layout).toBe("48");
  await render(at("hidden", "48"));
  await render(at("hidden", "6", P3.slice(0, 2)));
  await render(at("visible", "6", P3.slice(0, 2)));
  expect(h.current?.layout).toBe("6");
});

// Two wide panes appended together: the second covers the first until reveal() brings it back.
const deep = Array.from({ length: 6 }, (_, k) => ({ id: `p${k}`, title: `P${k}`, focus: 1 / 3 }));
const wide = [
  { id: "n1", title: "N1", focus: 0.8 },
  { id: "n2", title: "N2", focus: 0.8 },
];

const ref = { current: null as SashayHandle | null };
function Revealer() {
  useEffect(() => ref.current?.reveal("n1"), []);
  return wide.map((p) => <Pane key={p.id} {...p} />);
}
let mount = () => {};
function Late() {
  const [on, setOn] = useState(false);
  mount = () => setOn(true);
  return on ? <Revealer /> : null;
}
function Adder() {
  const [panes, setPanes] = useState(deep);
  useEffect(() => {
    if (panes.length > deep.length) ref.current?.reveal("n1");
  }, [panes]);
  return (
    <>
      <button type="button" id="add" onClick={() => setPanes([...deep, ...wide])} />
      <App ref={ref} layout="3-48" panes={panes} />
    </>
  );
}

test("a child effect can reveal a pane it just mounted", async () => {
  await render(<App ref={ref} layout="3-48" panes={deep} extra={<Late />} />);
  await act(async () => mount());
  expect(P("n1").hasAttribute("data-offscreen")).toBe(false);
  expect(P("n2").hasAttribute("data-closed")).toBe(true);
});

test("an effect after an event handler's setState can reveal the added pane", async () => {
  await render(<Adder />);
  await act(() => (host.querySelector("#add") as HTMLElement).click());
  expect(P("n1").hasAttribute("data-offscreen")).toBe(false);
  expect(P("n2").hasAttribute("data-closed")).toBe(true);
});

function FlushAdder() {
  const [panes, setPanes] = useState(deep);
  const add = () => {
    flushSync(() => setPanes([...deep, ...wide]));
    ref.current?.reveal("n1");
  };
  return (
    <>
      <button type="button" id="add" onClick={add} />
      <App ref={ref} layout="3-48" panes={panes} />
    </>
  );
}

test("an event handler can reveal a pane right after flushSync adds it", async () => {
  await render(<FlushAdder />);
  await act(() => (host.querySelector("#add") as HTMLElement).click());
  expect(P("n1").hasAttribute("data-offscreen")).toBe(false);
  expect(P("n2").hasAttribute("data-closed")).toBe(true);
});

test("<Pane> passes div props through; sashay's own attributes win", async () => {
  const onClick = vi.fn();
  const a = {
    ...P3[0],
    className: "mine",
    style: { color: "red", width: "1px", transform: "none" },
    "data-kind": "x",
    "aria-describedby": "d",
    onClick,
  };
  await render(<App layout="48" panes={[{ ...a, "data-sashay-pane": "zz" } as PaneProps, P3[1], P3[2]]} />);
  const el = P("a");
  expect(el.className).toBe("mine");
  expect(el.dataset.kind).toBe("x");
  expect(el.getAttribute("aria-describedby")).toBe("d");
  expect(el.style.color).toBe("red");
  expect(el.style.width).not.toBe("1px");
  expect(Number.isFinite(tx(el))).toBe(true);
  await act(() => el.click());
  expect(onClick).toHaveBeenCalledOnce();
});

test("compactLayout: a compact frame's default; a valid layout wins; not passed to the div", async () => {
  const at = async (width: number, layout?: string) => {
    const ref = { current: null as SashayHandle | null };
    const onLayoutChange = vi.fn();
    const p = { layout, ref, onLayoutChange, defaultLayout: [1 / 3, 2 / 3], compactLayout: [0, 1] };
    const app = <App key={`${width}${layout}`} {...p} style={{ width, height: 600 }} />;
    await render(<StrictMode>{app}</StrictMode>);
    expect(onLayoutChange).not.toHaveBeenCalled();
    return ref.current?.layout;
  };
  expect(await at(390)).toBe("0c");
  expect(await at(390, "zzz")).toBe("0c");
  expect(await at(390, "cc")).toBe("cc");
  expect(await at(960)).toBe("48");
  expect(host.querySelector("[compactlayout]")).toBeNull();
});

test("compactLayout: a remount after the width crossed compactBelow keeps the layout", async () => {
  const h = { current: null as SashayHandle | null };
  const at = (mode: "visible" | "hidden", width: number) => (
    <Activity mode={mode}>
      <App ref={h} compactLayout={[0, 1]} defaultLayout={[1 / 3, 2 / 3]} style={{ width, height: 600 }} />
    </Activity>
  );
  await render(at("visible", 960));
  await render(at("hidden", 960));
  await render(at("visible", 390));
  expect(host.querySelector("[data-compact]")).not.toBeNull();
  expect(h.current?.layout).toBe("48");
  h.current?.setLayout("cc");
  await render(at("hidden", 390));
  await render(at("visible", 390));
  expect(h.current?.layout).toBe("cc");
});
