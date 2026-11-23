import "../src/sashay.css";

/** A frame with one `section[data-sashay-pane]` per id, appended to the body. */
export function mountFrame(ids: string[], width = 960): HTMLElement {
  const frame = document.createElement("div");
  frame.style.cssText = `width:${width}px;height:600px`;
  for (const id of ids) frame.append(pane(id));
  document.body.append(frame);
  return frame;
}

export function pane(id: string): HTMLElement {
  const el = document.createElement("section");
  el.setAttribute("data-sashay-pane", id);
  return el;
}

/** translateX of an element's inline transform, in px. */
export const tx = (el: Element): number =>
  Number(/translateX\((-?[\d.e+-]+)px\)/.exec((el as HTMLElement).style.transform)?.[1] ?? Number.NaN);

export function pointer(el: Element, type: string, clientX: number, init: PointerEventInit = {}): void {
  el.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, pointerType: "mouse", button: 0, bubbles: true, clientX, ...init }),
  );
}

export const frames = (n = 2) =>
  new Promise<void>((r) => {
    const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
    step(n);
  });

/** Wait out a slide: widths settle and leaving panes hide once the 0.24s transition ends. */
export const slid = () => new Promise<void>((r) => setTimeout(r, 300));
