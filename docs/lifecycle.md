# Lifecycle and focus

## Surface lifecycle

```text
createBrowserSurface
        │ view hidden, 1280x800 until the first host rect
        ▼
host measures the page area
        │ clipRectToWindowContent
        ▼
setBounds + setVisible(true)
        │
        ├─ page loading → did-finish-load
        ├─ page hidden by host overlay → setVisible(false)
        ├─ page shown again → setVisible(true)
        ├─ explicit reload → same surface, same webContents when possible
        └─ crash → host decides whether to recreate or surface an error
        ▼
surface.destroy()
        │ removeChildView
        └─ webContents.close()
```

The adapter is deliberately small. It does **not** create a session store,
enforce capacity, decide which window owns a page, or inspect host DOM. Those
belong to the application.

## Initial viewport

A never-shown surface starts at `1280 × 800` CSS pixels instead of `0 × 0`.
CDP snapshot, eval, click, fill, press, scroll and screenshot can run while the
host panel is closed; a zero-sized view would make every document measure zero.
The first `setBounds` from the host replaces these temporary bounds. An existing
page keeps its last bounds when the host hides it, so hidden work still sees a
positive viewport.

## Visibility

Native views are above renderer DOM and are not clipped by CSS `overflow` or
`border-radius`. A host that draws a context menu, modal, popover or panel over
the page must:

1. compute whether the overlay intersects the page rect;
2. call `surface.setVisible(false)` while it is open;
3. call `surface.setVisible(true)` when it closes.

If the host keeps a persistent composer below the page, reserve that space so
the page rect and the overlay do not intersect by design. Do not add every
transient overlay to the native window; hide the whole surface while a host
overlay is actually over it.

`clipRectToWindowContent` only prevents a rect from exceeding the window content
area. The host still has to clip the rect to its own panel/container if it can
animate or scroll.

## Agent viewport emulation

The page is shared by the user and the agent. The raw `cdp` escape hatch can
set a layout viewport that does not match the native view:

- `Emulation.setDeviceMetricsOverride` makes the page lay out at, for example,
  1440px while the native view is only as wide as the host panel;
- the page considers 1440px its own viewport, so `scrollWidth === clientWidth`
  and it has no horizontal overflow to scroll;
- the native view clips the right side, which the user cannot reach.

Use `ViewportEmulationGuard` from the root entry:

```ts
const guard = new ViewportEmulationGuard();

const send = async (method, params) => {
  const result = await rawSend(method, params);
  guard.track(method);
  return result;
};

// Keep the override while the agent run is active.
// At run end, or when a user-visible surface appears outside a run:
await runInBrowserOperationQueue(() => guard.clear(send, console.warn));
// runInBrowserOperationQueue is the host's own browser-operation queue.
// When the page/debugger is detached or rebound:
guard.reset();
```

The clear must be serialized behind in-flight browser operations; otherwise a
concurrent `Emulation.setDeviceMetricsOverride` can finish after the reset and
re-emulate the page. Do not clear while an agent run is still using the
emulated viewport merely because the host opened a panel or a transient overlay
changed surface visibility.

## Focus

CDP `Input.*` is sent to the page target and does **not** require OS focus for
the native view. Do not call `view.webContents.focus()` before
click/fill/press/scroll. Keeping the native view unfocused is what lets a host
composer preserve IME composition; `fill` still changes DOM focus inside the
page.

Focus the page only when the user deliberately interacts with it (native view
mouse click is handled by Chromium). When the host needs keyboard ownership
back:

- call the host window's `webContents.focus()` (`surface.focus()` is for the
  page, not the host) before focusing a composer/search input;
- when a native page was focused and then hidden, hand keyboard focus back to
  the host;
- when routing a host shortcut from the page, hand focus to the host before
  dispatching the shortcut.

The host must verify this behavior on Windows/Linux, where focus and native
view hit-testing can differ from macOS.

## Ownership and multi-window

One live page should have one `ownerId`. A host can expose the same logical
session in multiple windows, but only one window should own the native page and
receive the surface. Other windows should show a “view in owner window” action.
Do not create a second page for the same owner.

The host should also define:

- capacity and eviction;
- which operations may run concurrently;
- when a page is destroyed after tab close, session deletion or crash;
- whether a page survives a host document reload.

## Hiding, screenshots and CDP

A hidden native view still has a live WebContents. The host can execute CDP and
capture screenshots when the page supports it, but hidden compositor capture is
platform-sensitive. Always put a bounded timeout around screenshot operations.
Use `snapshot` for semantic state rather than assuming a hidden screenshot is
available.

## Suggested host state

```ts
type HostSurface = {
  ownerId: string;
  page: BrowserSurface;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  documentGeneration: string;
};
```

On window resize, panel transitions, tab changes and scroll, recompute the rect
and call `setBounds`. On overlay changes, recompute `visible`. Keep the
surface and lifecycle state in the same module that owns the page so a stale
renderer message cannot resurrect a destroyed surface.
