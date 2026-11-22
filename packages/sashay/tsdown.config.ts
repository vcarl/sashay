import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx"],
  format: "esm",
  dts: true,
  fixedExtension: false,
  external: ["react", "react-dom", "react/jsx-runtime"],
});
