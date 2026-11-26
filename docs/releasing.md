# Releasing

## Prerequisites

- an npm account with publish access to the `@simon_he` scope;
- a granular npm token with read/write access to the package;
- a GitHub repository secret named `NPM_TOKEN` containing that token;
- the `version` and `release` workflows enabled.

The token is read by CI only. Never commit it, print it in logs, or add it to a
local `.npmrc` that is committed to the repository.

## Flow

1. Add a changeset in a feature PR:

   ```bash
   pnpm changeset
   ```

2. Merge to `main`. The `version` workflow opens a “version packages” PR.
3. Merge the version PR. `package.json` and `CHANGELOG.md` now carry the next
   version.
4. Tag the merge commit and push the tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. The `release` workflow installs, typechecks, tests, builds, publishes with
   provenance and creates a GitHub release.

## Manual fallback

If CI cannot publish, run locally after authenticating to the **public** npm
registry (the default registry may be a mirror):

```bash
npm login --registry=https://registry.npmjs.org
pnpm typecheck
pnpm test
pnpm build
pnpm publish --access public --provenance --registry=https://registry.npmjs.org
```

Verify the tarball before publishing:

```bash
pnpm pack --pack-destination /tmp
tar -tzf /tmp/simon_he-electron-browser-surface-<version>.tgz | head
```

## Version policy

The package follows SemVer. Breaking changes to exported types, error codes,
CDP fallback behavior or the Electron peer floor require a major version once
the API is stable. Before 1.0, breaking changes still require a clear Changeset
and migration note.
