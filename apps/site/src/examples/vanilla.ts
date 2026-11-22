import { createSashay } from "@vcarl/sashay";
import "@vcarl/sashay/style.css";

const frame = document.querySelector("#vanilla-mail") as HTMLElement;
frame.innerHTML = `
  <section data-sashay-pane="inbox"><button>Lunch?</button><button>Invoice</button><p></p></section>
  <section data-sashay-pane="message"></section>`;
const [inbox, message] = frame.querySelectorAll("section");
const code = inbox.querySelector("p") as HTMLElement;

const sash = createSashay(frame, {
  panes: [
    { id: "inbox", title: "Inbox", focus: 1 / 3 },
    { id: "message", title: "Message", focus: 2 / 3 },
  ],
  defaultLayout: [1], // only Inbox open
  onChange: (layout) => {
    code.textContent = `Layout: ${layout}`;
  },
});
inbox.addEventListener("click", (e) => {
  const b = (e.target as Element).closest("button");
  if (!b) return;
  message.textContent = `Message: ${b.textContent}`;
  sash.reveal("message");
});
