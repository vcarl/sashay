---
"@vcarl/sashay": patch
---

Keep the initial `layout` under React StrictMode. The second mount used to reset the panes to the default layout and report it through `onLayoutChange`, overwriting a layout read from the URL. The same fix covers Fast Refresh and re-shown `<Activity>` or Suspense content. Panes added to an empty frame now take the `layout` given at creation, and `onChange` fires only if that code doesn't apply as given.

`import "@vcarl/sashay/style.css"` no longer reports a type error with TypeScript's `noUncheckedSideEffectImports`.
