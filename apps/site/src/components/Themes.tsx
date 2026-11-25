import { Pane, Sashay } from "@vcarl/sashay/react";
import { useLayoutEffect, useState } from "react";
import { setThemeParam, ThemePicker, themeParam } from "./ThemePicker";
import "./themes.css";

export interface ThemeSource {
  css: string;
  fonts: string; // the import lines for the fonts it names
}

export function Themes({ sources }: { sources: Record<string, ThemeSource> }) {
  const [theme, setTheme] = useState("sash");
  // The page is prerendered, so `?theme=` is read once hydrated. Unknown names keep the default.
  useLayoutEffect(() => setTheme(themeParam() || "sash"), []);
  const pick = (next: string) => {
    setTheme(next);
    setThemeParam(next);
  };

  return (
    <div className="th-demo not-content">
      <ThemePicker value={theme} onPick={pick} />
      <div className="th-frame">
        <Sashay data-sashay-theme={theme} id="themed" defaultLayout={[1 / 2]} compactLayout={[0]}>
          <Pane id="windows" title="Windows" focus={1 / 2} className="th-pane">
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
            focus={1 / 2}
            className="th-pane"
            bar={{
              title: "Parts",
              height: "10rem",
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
        </Sashay>
      </div>
      <details>
        <summary>This theme's fonts</summary>
        <pre>{sources[theme].fonts}</pre>
      </details>
      <details>
        <summary>This theme's CSS</summary>
        <pre>{sources[theme].css}</pre>
      </details>
    </div>
  );
}
