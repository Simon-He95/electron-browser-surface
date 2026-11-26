# API reference

## Root entry

```ts
import {
  buildSnapshot,
  clickNode,
  fillNode,
  pressKey,
  scrollPage,
  evaluateExpression,
  waitForCondition,
  BrowserEventBuffers,
  BrowserError,
  BrowserOperationError,
  BrowserRefStaleError,
  BROWSER_SECURE_WEB_PREFERENCES,
} from '@simon_he/electron-browser-surface';
```

### CDP transport

All recipe functions take a function with this shape:

```ts
type CdpSend = <T = unknown>(
  method: string,
  params?: Record<string, unknown>,
) => Promise<T>;
```

The host usually implements it with:

```ts
const send = (method, params) => webContents.debugger.sendCommand(method, params);
```

### Snapshot

`buildSnapshot(input)` accepts the raw nodes from
`Accessibility.getFullAXTree` and returns:

```ts
{
  text: string,       // model-readable indentation
  refs: Map<string, RefEntry>,
  refCount: number,
}
```

`RefEntry` contains `ref`, `backendNodeId`, `role`, `name` and `nth`.
Interactive nodes receive refs; named content nodes also receive refs. A new
snapshot replaces the previous ref map.

### Actions

| Function | CDP sequence |
| --- | --- |
| `clickNode` | `DOM.scrollIntoViewIfNeeded` → `DOM.getBoxModel` → mouse move/press/release |
| `fillNode` | `DOM.focus` → select-all key event → `Input.insertText` |
| `pressKey` | `Input.dispatchKeyEvent` keyDown/keyUp |
| `scrollPage` | `Runtime.evaluate` `window.scrollBy` |
| `evaluateExpression` | `Runtime.evaluate` with `returnByValue` + `awaitPromise` |
| `waitForCondition` | bounded polling of element/text/url/load |

Stale node resolution raises `BrowserRefStaleError`; page exceptions raise
`BrowserEvalError`; invalid key specifications raise `BrowserOperationError`
with code `INVALID_KEY`.

### Event buffers

```ts
const buffers = new BrowserEventBuffers();
debugger.on('message', (_event, method, params) => {
  buffers.handleDebuggerMessage(method, params);
});
buffers.readConsole(clear);
buffers.readErrors(clear);
```

Buffers are bounded to 500 entries and are intentionally pull-based.

## `./electron`

```ts
import { createBrowserSurface, clipRectToWindowContent } from '@simon_he/electron-browser-surface/electron';
```

```ts
const surface = createBrowserSurface({
  window,
  viewConstructor: WebContentsView,
  partition: 'persist:my-browser',
  preload: inspectPreloadPath, // optional
  visible: false,
});

surface.setBounds({ x, y, width, height });
surface.setVisible(true);
surface.focus();
await surface.destroy();
```

`createBrowserSurface` does not focus the page. CDP input is delivered to its
`webContents` without changing the host's OS focus. `focus()` is for deliberate
user focus handoff, not for agent input.

`clipRectToWindowContent(window, rect)` returns a clipped rect or `undefined`
when the surface has no visible area. It does not know about host overlays;
that is the host's responsibility.

`handBackHostFocus(hostWebContents, hostWasFocused, pageWebContents)` restores
host keyboard ownership only if the host owned it before the operation and the
page now owns it.

## `./refresh`

```ts
import {
  discoverRefreshDependencies,
  buildRefreshDependencies,
  selectRefreshPlan,
  replaceStylesheet,
} from '@simon_he/electron-browser-surface/refresh';
```

`discoverRefreshDependencies(executeJavaScript)` runs the DOM/resource-timing
discovery script and validates its JSON result.

`buildRefreshDependencies(discovery, fallbackDocumentUrl)` yields a map keyed
by absolute local path. Every dependency has a kind (`document`, `style`,
`script`, `asset`), whether it is a direct stylesheet, and a signature.

`selectRefreshPlan({ pendingReload, pendingStyles, dependencies })` returns:

```ts
{ kind: 'none' } | { kind: 'css', path: string } | { kind: 'reload' }
```

`replaceStylesheet(executeJavaScript, { url })` performs the only partial
update. It clones a uniquely linked stylesheet with a cache-busting query and
waits for its load; it does not reload the document.

## `BrowserRuntime` contract

The package exports the high-level interface without an implementation. A host
wires it to the CDP recipes and its own state/blob storage. The methods and
failure semantics are defined in `src/runtime.ts`; the important invariants are:

- `navigate` creates or replaces the page; other methods require a live page.
- `click`/`fill`/`press`/`scroll` are side-effecting and invalidate refs.
- stale refs raise `BrowserRefStaleError`;
- browser-level CDP domains (`Browser.*`, `Target.*`) are rejected;
- screenshots are returned as host-owned references, not raw image pixels.
