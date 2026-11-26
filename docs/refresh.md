# Refresh policy

## Contract

For `file://` pages, “file changed” does not imply “reload everything.” The
library separates four decisions:

1. **Visibility** decides whether a visible page should apply a change now;
   hidden pages should be marked dirty by the host.
2. **Dependencies** decide whether the changed file belongs to the current
   document.
3. **Change kind** decides the update granularity.
4. **Host lease** decides when applying is safe relative to agent actions.

The package owns the pure dependency/plan functions and the safe CSS swap. The
host owns the watcher, dirty state, visibility state, leases and reload.

## What is partial

Only one directly linked stylesheet is eligible:

```html
<link rel="stylesheet" href="./site.css">
```

The fast path:

1. verifies exactly one matching link;
2. clones it with `?surface_refresh=<timestamp>`;
3. waits for `load`;
4. removes the old link only after the new one loads.

The document, DOM, JS state, scroll position and console remain. The host
should clear any element ref map because the page may have changed.

## What is a full reload

The following use `webContents.reload()` or an explicit host reload:

- entry HTML;
- JS/ESM modules;
- multiple stylesheets changing together;
- CSS `@import` or CSS loaded in a way that is not a direct, unique link;
- styles with `integrity`;
- images, fonts, media and other assets;
- dependency discovery failure or an unknown resource.

## Why no generic ESM HMR

Native ES modules do not expose a browser-level invalidation API. Importing
`module.js?t=...` creates a new module instance, repeats top-level side effects
and abandons the old module graph. A correct HMR system needs a bundler, a
module graph and an accept/dispose protocol. That belongs to a dev server, not
to a file watcher in an embedded browser.

If the page already has Vite/Next/webpack HMR, let that dev server own it. This
library is for `file://` pages and direct static assets.

## Suggested host algorithm

```ts
// per page
const state = {
  dependencies: new Map<string, RefreshDependency>(),
  pendingStyles: new Set<string>(),
  pendingReload: false,
  dirty: false,
  applying: false,
  documentId: '',
  visible: false,
};

async function onFileChanged(path: string) {
  const dependency = state.dependencies.get(path);
  if (!dependency) return;
  const signature = await statSignature(path);
  if (signaturesEqual(signature, dependency.signature)) return;

  state.dirty = true;
  if (dependency.kind === 'style') state.pendingStyles.add(path);
  else state.pendingReload = true;

  scheduleIfVisible();
}

async function apply() {
  const plan = selectRefreshPlan({
    pendingReload: state.pendingReload,
    pendingStyles: state.pendingStyles,
    dependencies: state.dependencies,
  });
  if (plan.kind === 'none') return;
  if (plan.kind === 'css') {
    const dependency = state.dependencies.get(plan.path);
    if (!dependency) return reload();
    await replaceStylesheet(executeJavaScript, { url: dependency.url });
    return;
  }
  await reload();
}
```

Use a 300 ms debounce and a 1 s minimum interval for visible pages. Hidden pages
should only record dirty state; apply once when they become visible or before
an agent perception action (`snapshot`/`screenshot`). Explicit mutations on a
dirty hidden page should fail fast with a stale-page error.

## Dependency discovery

`discoverRefreshDependencies` reads:

- `document.URL`;
- direct stylesheet links and their `integrity` flags;
- script `src`;
- image/source/video/audio/iframe/object/embed URLs;
- `performance.getEntriesByType('resource')`.

It only tracks `file:` URLs and clears query/hash for path matching. Dynamic
resources that never appear in resource timing may not be tracked; keep the
safe reload fallback.

## Host-owned invariants

- Watch dependency directories, not the whole workspace.
- Do not wake a dirty hidden page on every write.
- Serialize refresh with agent actions.
- Clear the ref map after a CSS swap or reload.
- Treat watcher unavailability and repeated failure as explicit states.
- Never report “page is fresh” without a stat/signature check.
