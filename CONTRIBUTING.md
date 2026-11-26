# Contributing

Thanks for improving `electron-browser-surface`.

## Development

Requirements: Node.js 20+, pnpm 10+.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

The demo requires Electron's native binary:

```bash
pnpm demo
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(surface): add clipped bounds helper
fix(focus): return keyboard ownership after hiding a page
docs(refresh): clarify @import fallback
test(snapshot): cover interactive-only output
chore(ci): add Node 22 to the matrix
```

Keep commits focused. A change to the public API should include:
- implementation;
- type/API docs;
- a regression test;
- a Changeset entry (`pnpm changeset`).

## Pull requests

Before opening a PR:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm build`
4. describe the user-visible behavior and any platform limitations;
5. include a Changeset for a user-facing change.

Do not add host-specific application code (Vue stores, product session
databases, private UI selectors) to the package. Put a host demo or integration
note under `examples/` or `docs/` instead.

## Release

Maintainers use Changesets. The `version` workflow opens a version PR; after it
merges, push a `vX.Y.Z` tag and let the `release` workflow publish with npm
provenance. The repository must have an `NPM_TOKEN` secret with publish access
to the `@simon_he` scope. A published release must build from a clean checkout.

## Questions

For security issues, follow [SECURITY.md](SECURITY.md) rather than opening a
public issue.
