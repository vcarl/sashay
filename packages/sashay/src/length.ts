export type Length = string | number;

const valid = new Set<string>();

export function checkLength(v: Length): void {
  const ok =
    typeof v === "number"
      ? Number.isFinite(v) && v >= 0
      : valid.has(v) || (typeof v === "string" && CSS.supports("width", v) && !!valid.add(v));
  if (!ok) throw new TypeError(`sashay: invalid length ${JSON.stringify(v)}`);
}

/**
 * Measures Lengths in place. `px(v, ref)`: `%` resolves against `ref` px (a pane's width)
 * when given, else the frame's width.
 */
export function createMeasure(frame: HTMLElement) {
  let box: HTMLElement | undefined;
  let probe: HTMLElement;
  const cache = new Map<string, number>();
  return {
    px(v: Length, ref?: number): number {
      if (typeof v === "number") return v;
      const key = `${ref ?? ""}|${v}`;
      let n = cache.get(key);
      if (n === undefined) {
        if (!box) {
          box = document.createElement("div");
          box.setAttribute("data-sashay-probe", "");
          box.style.cssText = "position:absolute;visibility:hidden;height:0;pointer-events:none;overflow:hidden";
          probe = document.createElement("div");
          box.append(probe);
          frame.append(box);
        }
        box.style.width = ref === undefined ? "100%" : `${ref}px`;
        probe.style.width = v;
        n = probe.getBoundingClientRect().width;
        cache.set(key, n);
      }
      return n;
    },
    clear: () => cache.clear(),
    destroy() {
      box?.remove();
      box = undefined;
    },
  };
}
