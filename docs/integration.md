# Integration guide

## 1. Create the native surface

```ts
import { BrowserWindow, WebContentsView } from 'electron';
import { createBrowserSurface, clipRectToWindowContent } from '@simon_he/electron-browser-surface/electron';

const surface = createBrowserSurface({
  window: mainWindow,
  viewConstructor: WebContentsView,
  partition: 'persist:my-agent-browser',
  preload: inspectPreloadPath,
  visible: false,
});
```

The surface starts hidden at zero bounds. The renderer reports the page area;
the host clips it and sets it visible:

```ts
const rect = clipRectToWindowContent(window, reportedRect);
if (rect) {
  surface.setBounds(rect);
  surface.setVisible(!hostOverlayOpen);
}
```

## 2. Implement a CDP transport

```ts
function send<T = unknown>(method: string, params?: Record<string, unknown>) {
  return surface.webContents.debugger.sendCommand(method, params) as Promise<T>;
}
```

Attach the debugger once for the page lifetime, and detach on destroy. Keep it
in the main process. Do not expose raw CDP to untrusted renderer content.

## 3. Implement `BrowserRuntime`

Use the recipes from the root entry and keep the high-level methods in your
host:

```ts
async function snapshot() {
  const { nodes } = await send<{ nodes: AXNodeData[] }>('Accessibility.getFullAXTree');
  return buildSnapshot({
    nodes,
    url: surface.webContents.getURL(),
    title: surface.webContents.getTitle(),
  });
}

async function click(ref: string) {
  const entry = refs.get(ref);
  if (!entry) throw new BrowserRefStaleError(ref);
  await clickNode(send, `@${entry.ref}`, entry.backendNodeId);
  refs.clear(); // side effects stale the old map
}
```

The host owns ref maps, stale-ref behavior, screenshot/blob storage and the
tool JSON format. The package only supplies the deterministic operations.

## 4. Add a host overlay policy

The package cannot know your app's menu/dialog selectors. Keep a host-side
visibility controller:

```ts
function updateSurfaceVisibility() {
  const overlayIntersectsPage = hostOverlayOpenFor(pageRect);
  surface.setVisible(!overlayIntersectsPage && panelVisible);
}
```

When the page is focused and an overlay is about to take over, return keyboard
ownership to the host renderer before focusing the overlay control.

## 5. Add refresh

Use `./refresh`:

- discover dependencies after `did-finish-load`;
- watch the directories of dependencies, not the whole workspace;
- debounce and merge changes;
- apply only when the page is visible or the agent requests perception;
- use `replaceStylesheet` for the single-link fast path;
- reload for any other change.

See [refresh.md](refresh.md) for the state machine.

## 6. Pair with your agent

The package is not tied to a model provider or tool framework. It pairs with:

- an OpenAI/Anthropic-style function-calling loop;
- an MCP server exposing browser tools;
- a local scripted test;
- a CUA/computer-use driver for OS-level fallbacks.

For CUA, keep the semantic browser path for DOM actions and use OS-level input
only for native dialogs, permission prompts, file pickers or pages without an
accessible DOM.
