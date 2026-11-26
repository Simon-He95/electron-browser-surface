# Demo

The demo is the shortest path to seeing the complete design:

```bash
pnpm install
pnpm demo
```

It launches a real Electron host with:

- a native `WebContentsView` at a measured rect;
- a host renderer with toolbar, log and an overlay;
- a local demo page;
- a scripted agent that uses the package's CDP recipes;
- a CSS fast-path refresh action.

## Try it

1. **Run scripted agent** — navigates to the local fixture, snapshots the AX
   tree, clicks `Go`, fills the email, scrolls and reads `window.__state()`.
2. **Update CSS** — rewrites the stylesheet and applies the single-link
   `replaceStylesheet` path. `__pageInstance` and `__keptMarker` remain, so the
   document was not reloaded.
3. **Reload** — explicit full reload; `__pageInstance` changes.
4. **Host overlay** — hides the native surface and shows a DOM overlay. Close
   it to restore the page.
5. **Navigate** — paste any URL into the address field.

No model key is required. The scripted agent is intentionally a fixed sequence;
replace it with your own tool loop or MCP tool server.

## What the demo demonstrates and what it doesn't

Demonstrates:

- native surface lifecycle;
- host-measured bounds;
- CDP actions from the main process;
- host overlay visibility;
- CSS fast path vs explicit reload.

Does not implement:

- production session storage;
- approvals, quotas or model integration;
- OS-native file dialogs;
- CUA/computer-use;
- full file-watcher orchestration.

Those are host application concerns. See [CUA pairing](../examples/with-cua/README.md)
and [integration](integration.md).
