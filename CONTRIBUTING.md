# Contributing

## Setup

Node 24 and pnpm: `pnpm i`. Scripts (run from the root): `pnpm typecheck`, `pnpm lint`,
`pnpm test`, `pnpm test:browser`, `pnpm bench`, `pnpm build`, `pnpm size`, `pnpm site:build`. Browser
tests need Chromium: `pnpm -F @vcarl/sashay exec playwright install chromium`.

## Pull requests

- Keep changes minimal: no speculative options or abstractions, no runtime dependencies.
- Add tests.
- Every user-visible change needs a changeset: `pnpm changeset`, pick patch/minor/major,
  write one user-facing line.
- The public API is specified in [docs/api.md](https://github.com/vcarl/sashay/blob/main/docs/api.md). Changing it needs maintainer
  sign-off; open an issue first. The site's Reference repeats it, so update both.
- Bugs need a reproduction link.

## Maintainers

Releases come from merging the Changesets "Version packages" PR; CI publishes to npm via
trusted publishing (OIDC, no token). On npmjs.com, the trusted publisher for `@vcarl/sashay` is
`vcarl/sashay`, workflow `release.yml`. CI on the "Version packages" PR may wait for a maintainer
to approve the run.
