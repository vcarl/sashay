---
"@vcarl/sashay": patch
---

A press in a pane's first 20px no longer drags its edge when it lands in an open popover or dialog in that pane (wherever it is shown), in editable content, or when the page already called `preventDefault()` on it. Edges also ignore keys the page already handled.
