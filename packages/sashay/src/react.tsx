"use client";

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
  useSyncExternalStore,
} from "react";
import {
  type BarOptions,
  COMPACT,
  createSashay,
  type Length,
  type PaneOptions,
  type SashayHandle,
} from "./controller.ts";
import { ssrHtml } from "./ssr.ts";

export type { Length, SashayHandle };

export interface SashayProps extends Omit<ComponentProps<"div">, "onChange" | "ref"> {
  layout?: string;
  defaultLayout?: number[];
  compactLayout?: number[];
  compactBelow?: Length;
  onLayoutChange?: (layout: string) => void;
  ref?: Ref<SashayHandle>;
}
interface OwnPaneProps extends Omit<PaneOptions, "bar"> {
  bar?: BarOptions & { content: ReactNode };
  keepInView?: Length | null;
  onClose?: () => void;
  children?: ReactNode | ((state: { offscreen: boolean }) => ReactNode);
}
// Other div props go to the pane element; sashay's own attributes override them.
export type PaneProps = OwnPaneProps &
  Omit<ComponentProps<"section">, keyof OwnPaneProps | "ref" | "inert" | "data-sashay-pane">;

interface Store {
  reg: Map<string, PaneProps>;
  h: SashayHandle | null;
  code: string | undefined; // last layout code reported or applied
  held?: string; // the layout at unmount, for a remount: the default may differ by then
  key: string; // last pane list sent to the controller
  dirty: boolean; // a pane registered or unregistered since the last flush
  flush(): void;
  changed(): void;
}
const Ctx = createContext<Store | null>(null);

const toOptions = ({ id, title, focus, minWidth, maxWidth, opensTo, edge, bar }: PaneProps): PaneOptions => ({
  id,
  title,
  focus,
  minWidth,
  maxWidth,
  opensTo,
  edge,
  bar: bar && { title: bar.title, height: bar.height },
});
const noSubscribe = () => () => {};
const returnFalse = () => false;
const returnTrue = () => true;
const METHODS = ["reveal", "close", "toggleBar", "keepInView", "fit", "update", "destroy"] as const;

export function Sashay(props: SashayProps): ReactElement {
  const {
    layout,
    defaultLayout: _d,
    compactLayout: _c,
    compactBelow,
    onLayoutChange,
    ref,
    nonce: _n,
    children,
    ...rest
  } = props;
  const frame = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const scope = useId();
  const ui = useRef<HTMLDivElement>(null);
  // True on the server and while hydrating; a client render needs no stand-in for the controller.
  const [ssr, setSsr] = useState(useSyncExternalStore(noSubscribe, returnFalse, returnTrue));
  const [s] = useState<Store>(() => ({
    reg: new Map(),
    h: null,
    code: layout,
    key: "",
    dirty: false,
    flush() {
      s.dirty = false;
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
      if (s.dirty) return;
      s.dirty = true;
      // <Sashay>'s layout effect flushes when it re-renders too; this covers a <Pane> that mounts alone.
      queueMicrotask(() => s.dirty && s.flush());
    },
  }));

  useLayoutEffect(() => {
    const f = frame.current as HTMLDivElement;
    // A remount (StrictMode, Fast Refresh, a re-shown Activity or Suspense) reuses the element
    // that destroy() stripped; paneList matches panes by this attribute.
    f.setAttribute("data-sashay-frame", "");
    const panes = paneList(f, s.reg);
    s.key = JSON.stringify(panes);
    // The controller makes the real controls before this commit paints. The style stays (see below).
    for (const el of ui.current?.querySelectorAll(":scope > div") ?? []) el.remove();
    const h = createSashay(f, {
      panes,
      layout: s.held ?? s.code,
      defaultLayout: latest.current.defaultLayout,
      compactLayout: latest.current.compactLayout,
      compactBelow: latest.current.compactBelow,
      onChange: (c) => {
        s.code = c;
        latest.current.onLayoutChange?.(c);
      },
      onClose: (id) => s.reg.get(id)?.onClose?.(),
    });
    s.h = h;
    for (const p of s.reg.values()) if (p.keepInView != null) h.keepInView(p.id, p.keepInView);
    // The first paint's style keeps transitions off until the controller's first paint has been styled.
    const raf = requestAnimationFrame(() => setSsr(false));
    return () => {
      cancelAnimationFrame(raf);
      s.held = h.layout;
      h.destroy();
      s.h = null;
    };
  }, [s]);
  // Children's layout effects ran first, so pane-list changes land before anyone's useEffect.
  useLayoutEffect(() => {
    if (s.dirty) s.flush();
  });
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
          (...a: unknown[]) => {
            if (s.dirty) s.flush(); // a <Pane> mounted in this commit, before <Sashay>'s layout effect
            return (s.h?.[k] as ((...x: unknown[]) => void) | undefined)?.apply(s.h, a);
          },
        ]),
      ) as unknown as SashayHandle),
      get layout() {
        return s.h?.layout ?? s.code ?? "";
      },
      setLayout(c: string) {
        if (s.dirty) s.flush();
        s.code = c; // so a later `layout` prop equal to the old code still applies
        s.held = undefined;
        s.h?.setLayout(c);
      },
    }),
    [s],
  );

  return (
    <Ctx value={s}>
      <div {...rest} ref={frame} data-sashay-frame="" data-sashay-ssr={scope}>
        {children}
        {ssr && <FirstPaint s={s} scope={scope} props={props} ref={ui} />}
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

// Rendered after the panes, so the registry holds them in render order. Opaque HTML, so hydration
// keeps the server's as it is: a suspended <Pane> may not have registered yet.
function FirstPaint({
  s,
  scope,
  props,
  ref,
}: {
  s: Store;
  scope: string;
  props: SashayProps;
  ref: Ref<HTMLDivElement>;
}) {
  const [__html] = useState(() => ssrHtml([...s.reg.values()].map(toOptions), props, scope, props.nonce));
  return (
    <div
      ref={ref}
      data-sashay-ssr-ui={scope}
      inert
      aria-hidden="true"
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: ssrHtml escapes it
      dangerouslySetInnerHTML={{ __html }}
    />
  );
}

export function Pane(props: PaneProps): ReactElement {
  const s = useContext(Ctx);
  if (!s) throw new Error("sashay: <Pane> must be inside <Sashay>");
  const { id, title, focus, minWidth, maxWidth, opensTo, edge, bar, keepInView, onClose, children, style, ...rest } =
    props;
  // The controller writes these inline; dropping them keeps a later re-render from clobbering its geometry.
  const { transform: _t, width: _w, zIndex: _z, clipPath: _c, ...ownStyle } = style ?? {};
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
      <section {...rest} style={ownStyle} ref={el} data-sashay-pane={id} data-bar={bar && ""} aria-label={title}>
        {fn ? children({ offscreen }) : children}
      </section>
      {bar && <div data-sashay-bar={id}>{bar.content}</div>}
    </>
  );
}
