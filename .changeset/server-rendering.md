---
"@vcarl/sashay": minor
---

Server rendering now covers the whole frame. The HTML has the edges, bar strips, spines and close button as well as the panes, and is right at any width: compact mode, the snap grid and the default split are chosen by container queries. `@vcarl/sashay/react` is marked `"use client"`, so server components can use `<Sashay>` and `<Pane>` directly. `nonce` on `<Sashay>` goes to the server's inline `<style>`, for a Content Security Policy.

The new `compactLayout`, on `<Sashay>` and `createSashay`, is used in place of `defaultLayout` when the frame is compact, so a phone can start on the pane you choose. The server's HTML uses it too. An empty layout code with more than one pane is now no code, so panes added to an empty frame, or replacing every pane, take the default layout as documented. Remounting keeps the layout.

Without JavaScript, panes that would be out of reach stack instead.
