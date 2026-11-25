import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { ExpressiveCodeTheme } from "@astrojs/starlight/expressive-code";
import { defineConfig } from "astro/config";

const ink = "#1B1A17";
const paper = "#F6EEDC";

// The mock's code colours: paper text on ink, mint comments, butter keywords, peach strings.
const sash = new ExpressiveCodeTheme({
  name: "sash",
  type: "dark",
  colors: { "editor.background": ink, "editor.foreground": paper },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#7FD1B4" } },
    { scope: ["keyword", "storage", "storage.type", "constant.language"], settings: { foreground: "#FFC846" } },
    { scope: ["string", "constant.numeric", "entity.name.tag"], settings: { foreground: "#FFB199" } },
  ],
});

const base = process.env.SITE_BASE ?? "/";
const to = (path) => `${base.replace(/\/?$/, "/")}${path}`;

export default defineConfig({
  site: "https://vcarl.com",
  base,
  // The pages folded into the Guide and the Reference, sent to their sections.
  redirects: {
    "/install": to("guide/#install"),
    "/first-frame": to("guide/#your-first-frame"),
    "/layout-codes": to("guide/#layout-in-the-url"),
    "/drawers": to("guide/#bottom-bars"),
    "/stacks": to("guide/#navigation-stacks"),
    "/compact": to("guide/#compact-mode"),
    "/styling": to("guide/#styling"),
    "/api": to("reference/"),
    "/react": to("reference/#vcarlsashayreact"),
    "/accessibility": to("reference/#accessibility"),
  },
  integrations: [
    react(),
    starlight({
      title: "sashay",
      tableOfContents: false,
      // sashay's layer must rank above Starlight's reset (`* { margin: 0 }`), and the first
      // @layer statement fixes the order, so declare it before any stylesheet loads.
      head: [{ tag: "style", content: "@layer starlight, sashay;" }],
      customCss: ["./src/styles/fonts.css", "./src/styles/tokens.css", "./src/styles/starlight.css"],
      components: {
        PageTitle: "./src/components/PageTitle.astro",
        SocialIcons: "./src/components/SocialIcons.astro",
        Sidebar: "./src/components/Sidebar.astro",
      },
      expressiveCode: {
        themes: [sash],
        useStarlightUiThemeColors: false,
        styleOverrides: {
          borderRadius: "10px",
          borderColor: ink,
          borderWidth: "0px",
          codeFontFamily: "var(--mono)",
          codeFontSize: "13.5px",
          codeLineHeight: "1.55",
          uiFontFamily: "var(--sans)",
          frames: { shadowColor: "transparent", frameBoxShadowCssValue: "none" },
        },
        // Long lines wrap inside the box; shell snippets get the plain code frame, not a terminal.
        defaultProps: { wrap: true, overridesByLang: { "bash,sh,shell": { frame: "code" } } },
      },
      sidebar: [
        { slug: "guide", label: "Guide" },
        { slug: "demos", label: "Demos" },
        { slug: "reference", label: "Reference" },
        { label: "Themes", link: "/themes/" },
      ],
    }),
  ],
});
