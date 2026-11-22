// React wrapper: <Pane>s register through context, one controller owns the DOM.
// Drag geometry never re-renders; prop changes go through update().
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  type Ref,
  useContext,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { COMPACT, createSashay, EDGE, type Length, type PaneOptions, type SashayHandle, SPINE } from "./controller.ts";
import { snapV, toWidths } from "./engine.ts";
import { decodeLayout, defaultView, normalize, windowEnd } from "./window.ts";

export type { Length, SashayHandle };

export interface SashayProps extends Omit<ComponentProps<"div">, "onChange" | "ref"> {
  layout?: string;
  defaultLayout?: number[];
  compactBelow?: Length;
  onLayoutChange?: (layout: string) => void;
  ref?: Ref<SashayHandle>;
}
export interface PaneProps extends Omit<PaneOptions, "edge"> {
  edge?: { width?: Length; drawer?: { width: Length; title: string; content: ReactNode } };
  keepInView?: Length | null;
  onClose?: () => void;
  children?: ReactNode | ((state: { offscreen: boolean }) => ReactNode);
}

interface Store {
  reg: Map<string, PaneProps>;
  h: SashayHandle | null;
  code: string | undefined; // last layout code reported or applied
  key: string; // last pane list sent to the controller
  queued: boolean;
  flush(): void;
  changed(): void;
}
const Ctx = createContext<Store | null>(null);

const toOptions = ({ keepInView, onClose, children, edge, ...p }: PaneProps): PaneOptions => {
  const d = edge?.drawer;
  return { ...p, edge: edge && { width: edge.width, drawer: d && { width: d.width, title: d.title } } };
};
const METHODS = ["reveal", "close", "toggleDrawer", "keepInView", "fit", "update", "destroy"] as const;

export function Sashay(props: SashayProps): ReactElement {
  const { layout, defaultLayout, compactBelow, onLayoutChange, ref, children, ...rest } = props;
  const frame = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const scope = useId();
  const [mounted, setMounted] = useState(false);
  const [s] = useState<Store>(() => ({
    reg: new Map(),
    h: null,
    code: layout,
    key: "",
    queued: false,
    flush() {
      const f = frame.current;
      if (!s.h || !f) return;
      const panes = paneList(f, s.reg);
      const key = JSON.stringify(panes);
      if (key !== s.key) {
        s.key = key;
        s.h.update({ panes });
      }
    },
    changed() {
      if (s.queued) return;
      s.queued = true;
      queueMicrotask(() => {
        s.queued = false;
        s.flush();
      });
    },
  }));

  useLayoutEffect(() => {
    const f = frame.current as HTMLDivElement;
    const panes = paneList(f, s.reg);
    s.key = JSON.stringify(panes);
    const h = createSashay(f, {
      panes,
      layout: s.code,
      defaultLayout: latest.current.defaultLayout,
      compactBelow: latest.current.compactBelow,
      onChange: (c) => {
        s.code = c;
        latest.current.onLayoutChange?.(c);
      },
      onClose: (id) => s.reg.get(id)?.onClose?.(),
    });
    s.h = h;
    for (const p of s.reg.values()) if (p.keepInView != null) h.keepInView(p.id, p.keepInView);
    // The SSR style keeps transitions off until the controller's first paint has been styled.
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(raf);
      h.destroy();
      s.h = null;
    };
  }, [s]);
  useLayoutEffect(() => s.h?.update({ compactBelow: compactBelow ?? COMPACT }), [s, compactBelow]);
  useLayoutEffect(() => {
    if (!s.h || layout === undefined || layout === s.code) return;
    s.flush(); // a pane-list change in the same render goes first
    s.code = layout;
    s.h.setLayout(layout);
  }, [s, layout]);
  useImperativeHandle(
    ref,
    () => ({
      ...(Object.fromEntries(
        METHODS.map((k) => [
          k,
          (...a: unknown[]) => (s.h?.[k] as ((...x: unknown[]) => void) | undefined)?.apply(s.h, a),
        ]),
      ) as unknown as SashayHandle),
      setLayout(c: string) {
        s.code = c; // so a later `layout` prop equal to the old code still applies
        s.h?.setLayout(c);
      },
    }),
    [s],
  );

  return (
    <Ctx value={s}>
      <div {...rest} ref={frame} data-sashay-frame="" data-sashay-ssr={scope}>
        {children}
        {!mounted && <SsrStyle s={s} scope={scope} layout={layout} defaultLayout={defaultLayout} />}
      </div>
    </Ctx>
  );
}

// Pane order is DOM order; panes not (yet) registered are skipped.
const paneList = (f: HTMLElement, reg: Map<string, PaneProps>) =>
  [...f.querySelectorAll<HTMLElement>("[data-sashay-pane]")].flatMap((el) => {
    const p = el.closest("[data-sashay-frame]") === f && reg.get(el.dataset.sashayPane ?? "");
    return p ? [toOptions(p)] : [];
  });

// Rendered after the panes, so the registry holds them in render order.
function SsrStyle({ s, scope, layout, defaultLayout }: { s: Store; scope: string } & SashayProps) {
  const panes = [...s.reg.values()];
  const n = panes.length;
  const d = decodeLayout(layout, n, (p) => Boolean(panes[p].edge?.drawer));
  const v = normalize(d?.view ?? defaultView(n, defaultLayout), n);
  const win = panes.slice(v.offset, windowEnd(v));
  const len = (x: Length) => (typeof x === "number" ? `${x}px` : x);
  let j = 0;
  const edges = win.map((p) => {
    const dr = p.edge?.drawer;
    return len(dr && d?.drawers[j++] ? dr.width : (p.edge?.width ?? EDGE));
  });
  const spine = v.offset ? SPINE : "0px";
  const C = `(100% - ${spine} - (${edges.join(" + ")}))`;
  const div = v.div.map(snapV);
  const w = toWidths(div);
  const q = (x: string) => JSON.stringify(x).replace(/</g, "\\3c ");
  const css = panes.map((p, i) => {
    const k = i - v.offset;
    const sel = `[data-sashay-ssr=${q(scope)}]:not([data-sashay-ready]) [data-sashay-pane=${q(p.id)}]`;
    if (k < 0 || k >= win.length) return `${sel}{visibility:hidden}`;
    const left = `calc(${C} * ${k ? div[k - 1] : 0} + ${spine} + ${edges.slice(0, k + 1).join(" + ")})`;
    return `${sel}{left:${left};width:max(calc(${C} * ${w[k]}), calc(${C} * ${p.focus}))}`;
  });
  css.push(`[data-sashay-ssr=${q(scope)}] [data-sashay-pane]{transition:none}`);
  return <style>{css.join("")}</style>;
}

export function Pane(props: PaneProps): ReactElement {
  const s = useContext(Ctx);
  if (!s) throw new Error("sashay: <Pane> must be inside <Sashay>");
  const { id, title, edge, keepInView, children } = props;
  s.reg.set(id, props); // during render too, so server rendering knows the panes
  const el = useRef<HTMLElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  const fn = typeof children === "function";

  useLayoutEffect(() => {
    s.reg.set(id, props);
    s.changed();
    return () => {
      s.reg.delete(id);
      s.changed();
    };
  });
  useLayoutEffect(() => s.h?.keepInView(id, keepInView ?? null), [s, id, keepInView]);
  useLayoutEffect(() => {
    const e = el.current;
    if (!fn || !e) return;
    const mo = new MutationObserver(() => setOffscreen(e.hasAttribute("data-offscreen")));
    mo.observe(e, { attributeFilter: ["data-offscreen"] });
    return () => mo.disconnect();
  }, [fn]);

  return (
    <>
      <section ref={el} data-sashay-pane={id} aria-label={title}>
        {fn ? children({ offscreen }) : children}
      </section>
      {edge?.drawer && <div data-sashay-drawer={id}>{edge.drawer.content}</div>}
    </>
  );
}
