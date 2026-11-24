// Bundling may drop or move "use client" (rolldown warns so). Only the React entry is a client module.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const files = readdirSync(dist).filter((f) => f.endsWith(".js"));
for (const f of ["index.js", "react.js"]) assert(files.includes(f), `dist/${f} is missing`);
for (const f of files) {
  const marked = /^\s*["']use client["']/m.test(readFileSync(new URL(f, dist), "utf8"));
  assert.equal(marked, f === "react.js", `dist/${f} ${marked ? "must not have" : "is missing"} "use client"`);
}
assert.match(
  readFileSync(new URL("react.js", dist), "utf8"),
  /^["']use client["'];?\s/,
  "dist/react.js must start with it",
);
