import { Pane, Sashay, type SashayHandle } from "@vcarl/sashay/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { kids, type Node, picture, root } from "./data";
import "./house.css";

// A navigation stack: the panes are just the path you've opened, an array the app edits.
// It opens `depth` levels down the first branch; `onUrl` gets the path, like "parlour/dresser".
export type HouseProps = { depth?: number; onUrl?: (url: string) => void };

export function House({ depth = 1, onUrl }: HouseProps) {
  // #region stack
  // `path` is the stack: the nodes from the house down to what's open.
  const [path, setPath] = useState(() => {
    const start = [root]; // a few levels down, so there's a stack to see
    while (start.length <= depth) start.push(kids(start[start.length - 1])[0]);
    return start;
  });
  // #endregion
  const sash = useRef<SashayHandle>(null);

  // Show the path ending at `n`: an ancestor on the path (back), or a child of any pane on it.
  // #region stack
  const go = (n: Node) => setPath([...path.slice(0, n.depth), n]); // path[i] is always at depth i
  // #endregion

  // Scroll the new leaf into view, as the stack changes (not on mount).
  const last = useRef(path);
  useLayoutEffect(() => {
    if (last.current === path) return;
    last.current = path;
    sash.current?.reveal(path[path.length - 1].id);
  }, [path]);
  useEffect(() => onUrl?.(path.slice(1).map(slug).join("/")), [path, onUrl]);

  return (
    // #region stack
    <Sashay ref={sash} className="house">
      {path.map((n, i) => (
        // The leaf × pops the stack back to the pane before it.
        <Pane
          key={n.id}
          id={n.id}
          title={n.name}
          focus={1 / 3}
          data-level={n.item ? "item" : n.depth % 3}
          onClose={() => go(path[i - 1] ?? root)}
        >
          <Level node={n} parent={path[i - 1]} path={path} go={go} />
        </Pane>
      ))}
    </Sashay>
    // #endregion
  );
}

const slug = (n: Node) => n.name.toLowerCase().replace(/\W+/g, "-");

function Level({ node, parent, path, go }: { node: Node; parent?: Node; path: Node[]; go: (n: Node) => void }) {
  const back = parent && (
    <button type="button" className="hs-back" aria-label={`Back to ${parent.name}`} onClick={() => go(parent)}>
      ‹ {parent.name}
    </button>
  );
  if (node.item)
    return (
      <div className="hs-item">
        {back}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own SVG, from data.ts */}
        <div className="hs-pic" dangerouslySetInnerHTML={{ __html: picture(node.item) }} />
        <h3>{node.name}</h3>
        <p>{node.item.desc}</p>
        <p className="hs-meta">Found in {parent?.name}</p>
      </div>
    );
  const list = kids(node);
  return (
    <div>
      {back}
      <h3>{node.name}</h3>
      <p className="hs-meta">{list.length ? `${list.length} ${list.length === 1 ? "thing" : "things"}` : "Empty"}</p>
      {list.length ? (
        <ul>
          {list.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                data-open={k.id}
                aria-current={path.some((p) => p.id === k.id) || undefined}
                onClick={() => go(k)}
              >
                {k.item ? (
                  <span className="hs-dot" style={{ background: k.item.colour }} />
                ) : (
                  <span className="hs-box" />
                )}
                <span>{k.name}</span>
                {k.item ? null : <span className="hs-chev">›</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hs-empty">Nothing in here but a little dust.</p>
      )}
    </div>
  );
}
