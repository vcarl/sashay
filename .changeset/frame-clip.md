---
"@vcarl/sashay": patch
---

A hash link, or `scrollIntoView`, to something in a closed or off-screen pane no longer scrolls the frame and shifts every pane. The frame now uses `overflow: clip`. If your own CSS sets `overflow: hidden` on it, change that to `clip` too.
