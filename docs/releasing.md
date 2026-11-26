# Releasing

## Prerequisites

- an npm account with publish access to the `@simon_he` scope;
- a clean `main` working tree with the next `CHANGELOG.md` entry already
  committed;
- `npm login --registry=https://registry.npmjs.org` on the release machine.

The release script publishes from the local machine. The tag push still runs
the GitHub `release` workflow, which skips the npm publish when the version
already exists and creates the GitHub release.

If the npm account requires a one-time password, either run
`npm login --auth-type=web --registry=https://registry.npmjs.org` first or pass
the current code:

```bash
NPM_OTP=123456 pnpm release 0.2.0
```

## Flow

```bash
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile

# Interactive version selection:
pnpm release

# Or pin the version:
pnpm release 0.2.0
```

`pnpm release` runs [bumpp](https://github.com/antfu/bumpp) with:

1. bump `package.json` to the next version;
2. `pnpm build`;
3. `npm publish --access public --registry=https://registry.npmjs.org`;
4. commit `chore: release v<version>` and create the annotated tag;
5. `git push` and `git push --tags`.

Build and publish run inside bumpp's `--execute` step, before the commit, tag
and push. If either fails, bumpp aborts and no remote commit or tag is created.
The working tree keeps the bumped `package.json`; fix the failure, restore or
re-run the bump, and publish again.

The release workflow triggers on the pushed tag. It re-runs typecheck, tests and
build, sees the version already on npm, skips the npm publish, and creates the
GitHub release.

## Manual fallback

If the scripted publish cannot run, do the same steps by hand:

```bash
pnpm build
npm publish --access public --registry=https://registry.npmjs.org

git add package.json CHANGELOG.md
git commit -m "chore: release v<version>"
git tag -a v<version> -m "v<version>"
git push
git push --tags
```

Keep the publish before the push. A pushed tag is public and should only point
at a version that is already available on npm.

## Version policy

The package follows SemVer. Breaking changes to exported types, error codes, CDP
fallback behavior or the Electron peer floor require a major version once the
API is stable. Before 1.0, breaking changes still require a clear changelog note
and migration guidance.
