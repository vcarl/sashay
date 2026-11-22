# sashay

A sliding-panes layout for the web, in the style of webOS/Enyo. Panes sit in a horizontal row,
each with a draggable edge. Dragging snaps to simple fractions, a throw flings the edge, a
squeezed pane slides under its neighbour, and drawers open from edges. The whole layout
encodes to a short string that fits in a URL.

Published as **`@vcarl/sashay`**, a production open-source library.

## Status

Pre-extraction. `raw/` holds the working code copied unedited from the app it was built in
(testbench). It is **reference material only**: mine it for behaviour, don't preserve its
API. `HANDOFF.md` explains the engine model, the tuned constants and the coupling to remove.
Read it before touching layout math. Once that knowledge lives in the code, tests and docs,
both `raw/` and `HANDOFF.md` get deleted.

## Goals

- **The best API for the supported features.** Compatibility with the app's
  `<Panes>` API is a non-goal. Redesign freely.
- **Web only, performance first.** Geometry is written to the DOM during drags with no
  framework re-render. Reports go out only on release, click or keypress.
- **Zero runtime dependencies** in the core. React is an optional peer dependency (`>=19`).
- **Accessible by default:** separators with arrow keys and `aria-valuenow`/`valuetext`,
  `inert` on covered panes, and `aria-expanded` on drawer toggles.
- **A landing page that sells it with a live demo, plus concise docs.** Short pages with
  runnable examples, not exhaustive prose.

**Non-goals:** React Native, other framework wrappers (until someone asks), a theming
system beyond CSS custom properties, and backwards compatibility with `raw/`.

## Shape

```
packages/sashay/   the library
  src/engine.ts    pure layout math (from raw/panes.ts), no DOM
  src/controller.ts  vanilla DOM controller: createSashay(el, opts) → { update, reveal, close, fit, setLayout, destroy }
  src/react.tsx    thin wrapper, exported as `@vcarl/sashay/react`
  src/sashay.css   plain CSS in @layer sashay, --sashay-* custom properties with fallbacks
apps/site/         Astro Starlight: custom landing page with live demo, plus docs
scripts/bugbot     local maintainer session (below)
```

- **One package, subpath exports** (`@vcarl/sashay`, `@vcarl/sashay/react`,
  `@vcarl/sashay/style.css`) rather than separate core and react packages. One version,
  one changelog, and React stays tree-shaken away for vanilla users. Split it only if a
  second framework wrapper arrives.
- **Stack:** pnpm workspaces, TypeScript (`nodenext`, strict), tsdown, ESM only, with an
  `exports` map and `sideEffects: ["*.css"]`. Biome lints and formats. Vitest runs the
  engine tests; Vitest browser mode (Playwright) covers drag, fling and keyboard.
  size-limit sets the bundle budget.
- The engine tests from `raw/panes.test.ts` are the behaviour spec. Port them first,
  unchanged, and keep them passing.
- The tuned constants (`UNIT_PX` 220, `FLING`, `VELOCITY_WINDOW_MS` 90, `FOCUS_MARGIN` 28,
  click threshold 4px, compact below 640px, grip 12px) are defaults. They may become
  options, but don't change their values.

## CI/CD

GitHub Actions:

- **Every PR:** typecheck, Biome, unit tests, browser tests, build, size-limit, site build.
- **Release:** Changesets. Merging to `main` opens or updates a "Version packages" PR. When
  Carl merges that PR, CI publishes to npm using trusted publishing (OIDC, with provenance
  and no stored token).
- **Site:** built in CI. It will be served from a subdirectory of vcarl.com (Astro `base`),
  but that's **not wired yet**. Don't add deploy steps until Carl says how.

## Bug bot

`scripts/bugbot` starts a local OpenCode session for Carl to drive. The model is served
locally by **oMLX** (OpenAI-compatible, `localhost:8000`) running **Qwen3.8 Flash**. oMLX
owns the model process, so the script never starts its own server. The API key comes from
the environment and is never committed.

- It works in a fresh git worktree, and seeds the session with open issues and PRs via `gh`
  plus an agent config (`.opencode/`) that covers three workflows:
  - **Triage issues:** reproduce, label, ask for missing details, link duplicates.
  - **Ship fixes:** branch, test first, open a PR with a changeset.
  - **Review outside PRs:** read the diff against these rules and leave review comments.
- Contributor code is **untrusted**. The bot reads it but never runs it locally. PR code
  runs only in CI.
- The bot can comment, label and open PRs. It **never** merges, approves its own work,
  publishes, tags or bumps versions.

## Rules for agents

- Write minimal code: no speculative options, abstractions or scaffolding "for later".
- Decide technical questions yourself. Ask Carl only about taste, product direction or scope.
- Never merge to `main`, publish, tag, bump versions or deploy. Carl cuts releases by
  merging the Changesets PR.
- Use append-only commits on shared branches: no rebase, reset or amend while other agents
  may be committing.
- Every user-visible change gets a changeset.
