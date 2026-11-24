// The first paint: what the server sends in place of the controller's work. Panes are placed by
// CSS, and the controls are inert copies of the controller's. The server doesn't know the frame's
// width, so each layout the frame could resolve to is a case behind a container query.
import { barHeight, CHEVRON, COMPACT, EDGE, type Length, type PaneOptions, SPINE, TABS } from "./controller.ts";
import { isOpen, MAX_DEN, nearest, snapV, toWidths, UNIT_PX } from "./engine.ts";
import { decodeLayout, defaultView, normalize, type View, windowEnd } from "./window.ts";

const HIDE = "visibility:hidden;content-visibility:hidden";
const SHOW = "visibility:inherit;content-visibility:visible"; // inherit: a nested frame hides with its pane
// Only the tabs nearest the window can be in view.
// ponytail: a frame taller than about 60 tabs shows its oldest ones on hydration.
const SPINE_TABS = 60;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const len = (x: Length) => (typeof x === "number" ? `${x}px` : x);
// Container queries can't resolve var(), and % there isn't the frame's: assume `or`.
const query = (x: Length, or: string) => (/%|var\(/.test(len(x)) ? or : len(x));
const edgeLengths = (win: PaneOptions[], compact: boolean) =>
  win.map((p, k) => (compact ? (k ? EDGE : TABS) : len(p.edge?.width ?? EDGE)));

export function ssrHtml(
  panes: PaneOptions[],
  o: { layout?: string; defaultLayout?: number[]; compactLayout?: number[]; compactBelow?: Length },
  scope: string,
  nonce = "",
): string {
  const n = panes.length;
  if (!n) return "";
  const q = (x: string) => JSON.stringify(x);
  const frame = `[data-sashay-ssr=${q(scope)}]:not([data-sashay-ready])`;
  const ui = `[data-sashay-ssr-ui=${q(scope)}]`;

  const d = decodeLayout(o.layout, n, (p) => Boolean(panes[p].bar));
  // The window the controller would pick: the code's, defaultLayout's, or the widest equal split
  // that fits, by the frame's width. Narrowest first, so in the CSS the widest that fits wins.
  const views: View[] = [];
  if (d) views.push(normalize(d.view, n));
  else views.push(defaultView(n, o.defaultLayout, (v) => !views.push(v)));
  views.reverse();
  const compactView = d ? views[0] : defaultView(n, o.compactLayout ?? o.defaultLayout);

  let controls = "";
  let cases = 0;
  const layoutCase = (v: View, div: number[], compact: boolean) => {
    const id = cases++;
    const own = `${ui} > [data-case="${id}"]`;
    const end = windowEnd(v);
    const win = panes.slice(v.offset, end);
    const w = toWidths(div);
    const edges = edgeLengths(win, compact);
    const left = v.offset ? SPINE : "0px";
    const C = `(100% - ${[left, end < n ? SPINE : "0px", ...edges].join(" - ")})`;
    // Divider k's x, plus the edges up to `e`.
    const x = (k: number, e: number) =>
      `left:calc(${C} * ${[0, ...div, 1][k]} + ${[left, ...edges.slice(0, e)].join(" + ")})`;
    const spine = (side: string, list: PaneOptions[]) =>
      list.length
        ? `<nav data-spine="${side}">${list.map((p) => `<button type="button" data-sashay-spine-tab="${esc(p.id)}">${esc(p.title)}</button>`).join("")}</nav>`
        : "";

    let html = spine("start", panes.slice(0, v.offset).slice(-SPINE_TABS));
    html += spine("end", panes.slice(end, end + SPINE_TABS));
    let css = `${ui}{display:contents}${ui} > [data-case]{display:none}${own}{display:contents}`;
    let whole = !compact && win.length === n; // every pane shows in full, so it reads without JS
    let j = 0;
    panes.forEach((p, i) => {
      const k = i - v.offset;
      const pane = `${frame} [data-sashay-pane=${q(p.id)}]`;
      const bar = `${frame} [data-sashay-bar=${q(p.id)}]`;
      if (k < 0 || i >= end) {
        css += `${pane}{${HIDE}}`;
        if (p.bar) css += `${bar}{${HIDE}}`;
        return;
      }
      const open = isOpen(w[k]);
      whole &&= w[k] >= p.focus - 1e-9;
      const box = `${x(k, k + 1)};width:calc(${C} * ${w[k]});z-index:${2 * k + 1}`;
      css += `${pane}{position:absolute;${x(k, k + 1)};width:calc(${C} * ${Math.max(w[k], p.focus)});z-index:${2 * k};${open ? SHOW : HIDE}}`;
      css += `${own} > [data-sashay-edge=${q(p.id)}]{${x(k, k)};width:${edges[k]};z-index:${2 * k}}`; // over its pane, under its bar
      const role = k ? 'role="separator"' : `role="button" aria-expanded="${open}"`;
      html += `<div data-sashay-edge="${esc(p.id)}" ${role} aria-label="${esc(p.title)}"><span data-sashay-dots></span></div>`;
      if (!p.bar) return;
      const up = Boolean(d?.bars[j++]);
      const h = `--sashay-bar-height:${barHeight(p.bar)}`;
      css += `${bar}{position:absolute;${box};${h};${open && up ? `${SHOW};bottom:0` : HIDE}}`;
      css += `${own} > [data-sashay-bar-toggle=${q(p.id)}]{${box};${h};${open ? SHOW : HIDE}}`;
      html += `<button type="button" data-sashay-bar-toggle="${esc(p.id)}" aria-expanded="${up}"><span>${esc(p.bar.title)}</span>${CHEVRON}</button>`;
    });
    if (compact) {
      css += `${own} > [data-sashay-tabs]{${x(0, 0)};z-index:1}${own} [data-sashay-dots]{--g:4px}`;
      html += `<div data-sashay-tabs>${win.map((p, k) => `<button type="button" data-sashay-tab="${esc(p.id)}" aria-pressed="${isOpen(w[k])}">${esc(p.title)}</button>`).join("")}</div>`;
    } else if (w.filter(isOpen).length > 1) {
      const k = w.findLastIndex(isOpen);
      css += `${own} > [data-sashay-close]{${x(k + 1, k + 1)}}`;
      html += '<button type="button" data-sashay-close>×</button>';
    }
    // Without JS, panes that would be out of reach stack in a scrolling frame instead.
    if (!whole)
      css += `@media (scripting: none){${frame} :is([data-sashay-pane],[data-sashay-bar]){position:relative;left:0;width:auto;${SHOW}}${ui}{display:none}}`;
    controls += `<div data-case="${id}">${html}</div>`;
    return css;
  };

  const chain = (list: View[], compact: boolean) => {
    const found = new Map<string, { css: string; when: string[] }>();
    for (const v of list) {
      const win = panes.slice(v.offset, windowEnd(v));
      const E = edgeLengths(win, compact)
        .map((e) => query(e, e === TABS ? "2.75rem" : EDGE))
        .join(" + ");
      const atLeast = (x: string) => `(width >= calc(${E} + ${x}))`;
      const choosing = list.length > 1 && win.length > 1;
      for (let order = MAX_DEN; order >= 1; order--) {
        const div = v.div.map((i) => snapV(nearest(snapV(i), order)));
        const w = toWidths(div);
        if (choosing && !w.every(isOpen)) continue;
        const key = `${v.offset}:${div}`;
        let c = found.get(key);
        if (!c) {
          c = { css: layoutCase(v, div, compact), when: [] };
          found.set(key, c);
        }
        const when = order > 1 ? [atLeast(`${UNIT_PX * order}px`)] : [];
        if (order < MAX_DEN) when.push(`(width < calc(${E} + ${UNIT_PX * (order + 1)}px))`);
        if (choosing)
          win.forEach((p, k) => {
            if (p.minWidth)
              when.push(atLeast(`${v.offset ? "1.5rem" : "0px"} + ${query(p.minWidth, "0px")} / ${w[k]}`));
          });
        c.when.push(`(${when.join(" and ")})`);
      }
    }
    return [...found.values()]
      .map(({ css, when }, k) => (k ? `@container sashay ${when.join(" or ")}{${css}}` : css))
      .join("");
  };

  const css =
    `${frame}{container:sashay / inline-size}` +
    // The controller scrolls the start spine to its end, where its newest tab is.
    `${ui} [data-spine="start"]{justify-content:flex-end}${ui} [data-spine="start"]::after{content:"";margin-bottom:auto}` +
    chain(views, false) +
    `@container sashay (width < ${query(o.compactBelow ?? COMPACT, COMPACT)}){${chain([compactView], true)}}` +
    `@media (scripting: none){${frame}{overflow:auto}${frame} [data-sashay-bar]{bottom:0;height:auto;${SHOW}}${ui} :is([data-sashay-bar-toggle],[data-sashay-close]){display:none}}` +
    // Past ready: the controller's first paint mustn't animate from this one.
    `[data-sashay-ssr=${q(scope)}] :is([data-sashay-pane],[data-sashay-edge],[data-sashay-bar],[data-sashay-bar-toggle],[data-sashay-tabs]){transition:none}`;
  return `<style${nonce && ` nonce="${esc(nonce)}"`}>${css.replace(/<\//g, "<\\/")}</style>${controls}`;
}
