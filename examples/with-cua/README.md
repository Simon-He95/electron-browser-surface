# Pairing with CUA / computer use

This package does **not** depend on CUA. It exposes the browser page through
CDP and the native `WebContentsView` surface, so it can be used by:

- an agent runtime that calls the semantic `BrowserRuntime` API;
- an MCP tool server;
- a hand-written Electron command palette or test script;
- a computer-use/CUA driver when OS-level input is needed.

## Recommended split

```text
Agent / tool loop
  ├─ BrowserRuntime (this package): navigate, snapshot, click, fill, press,
  │  scroll, wait, screenshot, console/errors, raw CDP
  │     └─ WebContentsView surface
  └─ CUA / computer use (optional): OS-native UI
        ├─ file pickers and native permission dialogs
        ├─ browser chrome outside the embedded page
        └─ pixel-level fallback when no DOM/AX path exists
```

CUA is useful when the task crosses the boundary of the embedded page:
downloading a file, choosing a native folder, accepting an OS permission
prompt, or operating an app that has no accessible DOM. It should not replace
the semantic path for ordinary page actions: CDP gives stable refs and avoids
moving the user's real keyboard focus.

## Example adapter shape

```ts
type ComputerUse = {
  screenshot(): Promise<{ width: number; height: number }>;
  click(point: { x: number; y: number }): Promise<void>;
  type(text: string): Promise<void>;
};

async function nativeDialogFallback(cua: ComputerUse) {
  await cua.screenshot();
  // The host knows the dialog position; CUA handles the OS-level click.
  await cua.click({ x: 640, y: 420 });
}
```

Keep CUA separate from `BrowserRuntime`: only expose CUA to the agent when the
task needs OS interaction, and keep its screenshots/input scoped to the host
window. The browser surface remains the source of truth for page content.
