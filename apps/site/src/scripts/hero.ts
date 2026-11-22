import { createSashay } from "@vcarl/sashay";

export function mountHero(frame: HTMLElement, readout: HTMLElement): () => void {
  // Compact (a phone): one pane at a time, starting on Hello.
  const DEFAULT = frame.clientWidth < 640 ? [1, 1] : [0.5, 0.75];
  const code = readout.querySelector(".code") as HTMLElement;
  const show = (layout: string) => {
    code.textContent = layout;
    const url = new URL(location.href);
    url.searchParams.set("layout", layout);
    history.replaceState(history.state, "", url);
  };
  const h = createSashay(frame, {
    panes: [
      { id: "hello", title: "Hello", focus: 0.5, edge: { width: "var(--edge)" } },
      { id: "why", title: "Why", focus: 0.25, edge: { width: "var(--edge)" } },
      { id: "install", title: "Install", focus: 0.25, edge: { width: "var(--edge)" } },
    ],
    defaultLayout: DEFAULT,
    layout: new URLSearchParams(location.search).get("layout") ?? undefined,
    onChange: show,
  });
  show(h.layout);
  const reset = () => h.fit(DEFAULT);
  const button = readout.querySelector("button") as HTMLButtonElement;
  button.addEventListener("click", reset);
  return () => {
    button.removeEventListener("click", reset);
    h.destroy();
  };
}
