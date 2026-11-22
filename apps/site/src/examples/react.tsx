import { Pane, Sashay } from "@vcarl/sashay/react";
import { useState } from "react";

export default function Mail() {
  const [open, setOpen] = useState<string | null>(null);
  const [code, setCode] = useState("");
  return (
    <Sashay defaultLayout={[1 / 3]} onLayoutChange={setCode}>
      <Pane id="inbox" title="Inbox" focus={1 / 3}>
        {["Lunch?", "Invoice"].map((s) => (
          <button key={s} type="button" onClick={() => setOpen(s)}>
            {s}
          </button>
        ))}
        <p>Layout: {code}</p>
      </Pane>
      {open && (
        <Pane id={open} title={open} focus={2 / 3} onClose={() => setOpen(null)}>
          {({ offscreen }) => (offscreen ? null : <p>Message: {open}</p>)}
        </Pane>
      )}
    </Sashay>
  );
}
