# Contributing

## Setup

Node 24 and pnpm: `pnpm i`. Scripts (run from the root): `pnpm typecheck`, `pnpm lint`,
`pnpm test`, `pnpm build`.

## Pull requests

- Keep changes minimal: no speculative options or abstractions, no runtime dependencies.
- Add tests.
- Every user-visible change needs a changeset: `pnpm changeset`, pick patch/minor/major,
  write one user-facing line.
- The public API is specified in [docs/api.md](docs/api.md). Changing it needs maintainer
  sign-off; open an issue first.
- Bugs need a reproduction link.

## Maintainers

Releases come from merging the Changesets "Version packages" PR; CI publishes to npm via
trusted publishing (OIDC, no token). One-time setup, done by hand at first publish: on
npmjs.com, configure the trusted publisher for `@vcarl/sashay` (owner, repo, workflow
`release.yml`).
