---
"@vcarl/sashay": patch
---

Edges feel more physical:

- A vertical swipe on an edge no longer toggles its pane. The click threshold is 4px in any direction, and a gesture that goes vertical first neither drags nor toggles.
- Grabbing an edge while panes are still sliding continues from where they are on screen, instead of jumping to where they were heading.
- An edge is easier to grab, especially on touch: a horizontal drag that starts within 20px of a pane's leading edge moves that edge. A click or vertical swipe there still belongs to the pane's content, so buttons and text selection near the edge work as before.
- Dragging past either end follows the pointer at a quarter of its speed, then settles back on release, instead of stopping dead.
