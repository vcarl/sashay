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

export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  integrations: [
    react(),
    starlight({
      title: "sashay",
      tableOfContents: false,
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
      },
      sidebar: [
        {
          label: "Start",
          items: [
            { slug: "install", label: "Install" },
            { slug: "first-frame", label: "Your first frame" },
            { slug: "layout-codes", label: "Layout codes" },
          ],
        },
        {
          label: "Guides",
          items: [
            { slug: "drawers", label: "Drawers" },
            { slug: "stacks", label: "Navigation stacks" },
            { slug: "compact", label: "Compact mode" },
            { slug: "styling", label: "Styling" },
          ],
        },
        {
          label: "Reference",
          items: [
            { slug: "api", label: "createSashay()" },
            { slug: "react", label: "<Sashay> for React" },
            { slug: "accessibility", label: "Accessibility" },
          ],
        },
      ],
    }),
  ],
});
