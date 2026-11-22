import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  base: process.env.SITE_BASE ?? "/",
  integrations: [
    react(),
    starlight({
      title: "sashay",
      customCss: ["./src/styles/starlight.css"],
      sidebar: [],
    }),
  ],
});
