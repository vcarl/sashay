---
"@vcarl/sashay": patch
---

A partly covered pane is no longer `inert`: its visible slice takes clicks and focus, and the next pane takes input over the covered part. Keyboard focus landing under the next pane uncovers the pane. `reveal(id)` now uncovers an open but partly covered pane. Closed and off-screen panes stay `inert`.
