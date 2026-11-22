import { createSashay, type SashayHandle } from "@vcarl/sashay";

// sashay has no getter for the current code and onChange fires only on a
// change, so nudge the dividers away and back (same task, no paint) to make it
// report. ponytail: replace with a layout getter if the library grows one.
export const report = (frame: HTMLElement, h: SashayHandle) => {
  const now = [...frame.querySelectorAll<HTMLElement>('[role="separator"]')].map(
    (e) => Number(e.getAttribute("aria-valuenow")) / 100,
  );
  h.fit(now.every((f) => f === 1) ? now.map(() => 0) : now.map(() => 1));
  h.fit(now);
};

export function mountHero(frame: HTMLElement, readout: HTMLElement): () => void {
  // Compact (a phone): one pane at a time, starting on Hello.
  const DEFAULT = frame.clientWidth < 640 ? [1, 1] : [0.5, 0.75];
  const code = readout.querySelector(".code") as HTMLElement;
  const h = createSashay(frame, {
    panes: [
      { id: "hello", title: "Hello", focus: 0.5, edge: { width: "var(--stile)" } },
      { id: "why", title: "Why", focus: 0.25, edge: { width: "var(--stile)" } },
      { id: "install", title: "Install", focus: 0.25, edge: { width: "var(--stile)" } },
    ],
    defaultLayout: DEFAULT,
    layout: new URLSearchParams(location.search).get("layout") ?? undefined,
    onChange(layout) {
      code.textContent = layout;
      const url = new URL(location.href);
      url.searchParams.set("layout", layout);
      history.replaceState(history.state, "", url);
    },
  });
  report(frame, h);
  const reset = () => h.fit(DEFAULT);
  const button = readout.querySelector("button") as HTMLButtonElement;
  button.addEventListener("click", reset);
  return () => {
    button.removeEventListener("click", reset);
    h.destroy();
  };
}
