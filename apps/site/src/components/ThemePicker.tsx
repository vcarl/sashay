import "./theme-picker.css";

// Each theme's frame, pane and accent, from themes.css. "" is no theme.
export const THEMES: Record<string, [label: string, ...colors: string[]]> = {
  sash: ["Sash", "#1b1a17", "#f6eedc", "#d94a30"],
  shoji: ["Shoji", "#3b2a1e", "#f2f4f1", "#c9634f"],
  greenhouse: ["Greenhouse", "#dfeae2", "#f4faf5", "#9b4a86"],
  blueprint: ["Blueprint", "#0f2f6b", "#143a82", "#ffb454"],
  curtain: ["Curtain", "#4a0f1f", "#2a0a14", "#e8b04a"],
  sleeper: ["Sleeper", "#16242e", "#1e303c", "#f2b65a"],
};
const HOUSE = ["House", "#e85a40", "#1f3fcb", "#ffc846"];

/** `?theme=`, untrusted: a theme's name, or "". */
export const themeParam = () => {
  const t = new URLSearchParams(location.search).get("theme") ?? "";
  return Object.hasOwn(THEMES, t) ? t : "";
};
export function setThemeParam(theme: string) {
  const url = new URL(location.href);
  if (theme) url.searchParams.set("theme", theme);
  else url.searchParams.delete("theme");
  history.replaceState(history.state, "", url);
}

/** `house`: also offer no theme, the page's own look. */
export function ThemePicker({
  value,
  onPick,
  house,
}: {
  value: string;
  onPick: (theme: string) => void;
  house?: boolean;
}) {
  return (
    <fieldset className="th-pick">
      <legend>Theme</legend>
      {[...(house ? [["", HOUSE] as const] : []), ...Object.entries(THEMES)].map(([id, [label, ...colors]]) => (
        <label key={id}>
          <input type="radio" name="theme" value={id} checked={id === value} onChange={() => onPick(id)} />
          <span className="th-swatch" aria-hidden="true">
            {colors.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
          {label}
        </label>
      ))}
    </fieldset>
  );
}
