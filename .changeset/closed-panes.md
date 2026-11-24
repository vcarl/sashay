---
"@vcarl/sashay": patch
---

Closed panes stay closed. This changes what closing a pane does: it used to open the nearest closed pane to keep the open count steady, even one the user had closed or that started closed. Now it brings back only panes sashay collapsed itself: panes in a spine, and panes pushed shut to make room for one that opened. Anything else stays closed until someone opens it, and its neighbours take the space.

Removing every visible pane of a stack now unfolds the panes before them, instead of resetting to the default layout.
