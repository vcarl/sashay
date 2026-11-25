import { Pane, Sashay } from "@vcarl/sashay/react";
import { useLayoutEffect, useState } from "react";

export interface Theme {
  id: string;
  css: string;
  fonts: string; // the import lines for the fonts it names
  colors: string[];
}

const ABOUT: Record<string, string> = {
  sash: "The house style: a sturdy ink rail with a tomato pull tab.",
  shoji: "Paper screens in a thin lattice, with light type and almost no hardware.",
  greenhouse: "Pale glass and glazing bars, with rounded type and rounded marks.",
  blueprint: "The window before it is built: small monospace, and a ruler on every rail.",
  curtain: "Velvet folds thick enough to pull, brass beads and bookish type.",
  sleeper: "A night train: condensed signage type on narrow metal rails.",
};

export function Themes({ themes }: { themes: Theme[] }) {
  const [id, setId] = useState("sash");
  // The page is prerendered, so `?theme=` is read once hydrated. Unknown names keep the default.
  useLayoutEffect(() => {
    const q = new URLSearchParams(location.search).get("theme");
    if (themes.some((t) => t.id === q)) setId(q as string);
  }, [themes]);
  const pick = (next: string) => {
    setId(next);
    const url = new URL(location.href);
    url.searchParams.set("theme", next);
    history.replaceState(history.state, "", url);
  };
  const theme = themes.find((t) => t.id === id) ?? themes[0];

  return (
    <>
      <fieldset className="th-pick">
        <legend>Theme</legend>
        {themes.map((t) => (
          <label key={t.id}>
            <input type="radio" name="theme" value={t.id} checked={t.id === id} onChange={() => pick(t.id)} />
            <span className="th-swatch" aria-hidden="true">
              {t.colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {t.id}
          </label>
        ))}
      </fieldset>
      <p className="th-about">{ABOUT[theme.id]}</p>
      <div className="th-frame">
        <Sashay data-sashay-theme={theme.id} id="themed" defaultLayout={[1 / 3, 2 / 3]} compactLayout={[0, 1]}>
          <Pane id="windows" title="Windows" focus={1 / 3} className="th-pane">
            <h3>Windows</h3>
            <ul>
              {["Front bay", "Kitchen", "Stair landing", "Attic"].map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Pane>
          <Pane
            id="landing"
            title="Landing"
            focus={1 / 3}
            className="th-pane"
            bar={{
              title: "Parts",
              height: "11rem",
              content: (
                <>
                  <p>Sash cord, 6 mm</p>
                  <p className="th-quiet">Two weights, 4.5 kg each</p>
                </>
              ),
            }}
          >
            <h3>Stair landing</h3>
            <p>The top sash sticks in wet weather. Cord replaced, pulley still noisy.</p>
            <p className="th-quiet">Last opened in October</p>
          </Pane>
          <Pane id="visit" title="Visit" focus={1 / 3} className="th-pane">
            <h3>Next visit</h3>
            <p>Ease the top sash and wax the channel. Bring a spare pulley.</p>
            <p className="th-quiet">About an hour</p>
          </Pane>
        </Sashay>
      </div>
      <p className="th-hint">
        Drag an edge, then throw one. Open the Parts bar. The layout stays put as you change theme.
      </p>
      <section className="th-code">
        <div>
          <h2>Use it.</h2>
          <pre>{`import "@vcarl/sashay/style.css";
import "@vcarl/sashay/themes.css";

<Sashay data-sashay-theme="${theme.id}">…</Sashay>`}</pre>
          <p>
            The theme names fonts but doesn't load them, and falls back to system fonts. To load them from Fontsource:
          </p>
          <pre>{theme.fonts}</pre>
        </div>
        <div>
          <h2>Make it yours.</h2>
          <p>A theme is a list of variables. Set any of them on the frame in your own CSS, or copy the lot.</p>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs the keyboard */}
          <pre className="th-vars" tabIndex={0}>
            {theme.css}
          </pre>
        </div>
      </section>
    </>
  );
}
