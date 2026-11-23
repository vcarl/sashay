---
"@vcarl/sashay": patch
---

Edges feel more physical:

- A vertical swipe on an edge no longer toggles its pane. The click threshold is 4px in any direction, and a gesture that goes vertical first neither drags nor toggles.
- Grabbing an edge while panes are still sliding continues from where they are on screen, instead of jumping to where they were heading.
- Edges take the pointer across 32px (the 12px edge plus 20px into its own pane), so they're easier to hit, especially on touch.
- Dragging past either end follows the pointer at a quarter of its speed, then settles back on release, instead of stopping dead.
