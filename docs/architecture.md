# Architecture

## Boundary

`electron-browser-surface` is a browser runtime, not an agent framework.

```text
┌─────────────────────────────────────────────────────────────┐
│ Your agent / tool loop / MCP server / test runner           │
│  decides what to do, owns prompts, approvals and blobs      │
└───────────────────────────┬─────────────────────────────────┘
                            │ semantic actions
┌───────────────────────────▼─────────────────────────────────┐
│ Your Electron host                                           │
│  session ownership, window selection, host overlays,        │
│  file watchers, leases, capacity, model/runner integration  │
│                                                             │
│  BrowserRuntime implementation                              │
│   ├─ CDP transport: webContents.debugger.sendCommand        │
│   └─ refresh policy: discover → select plan → apply         │
└───────────────────────────┬─────────────────────────────────┘
                            │ setBounds / setVisible / focus
┌───────────────────────────▼─────────────────────────────────┐
│ WebContentsView surface                                      │
│  native child of BrowserWindow.contentView                  │
│  normal Chromium page: DOM, AX, file://, resource timing     │
└─────────────────────────────────────────────────────────────┘
```

The package deliberately does not own:

- an LLM or tool-calling protocol;
- a Vue/React store or UI;
- a host-specific session database;
- host overlay selectors;
- an automatic window/tab-switching policy.

Those are product decisions. The package exposes the primitives and documents
safe host behavior.

## Why WebContentsView

A renderer `<webview>` is a DOM element. It participates in host layout and
focus, so agent actions can force the host composer out of its IME composition.
A native `WebContentsView`:

- is one Chromium page with an ordinary `webContents`;
- is a child of the window `contentView`, independent of host DOM;
- receives CDP `Input.*` without becoming the OS keyboard focus owner;
- can be hidden with `setVisible(false)` and measured with integer DIP bounds.

The trade-off is that native views draw above renderer DOM. The host must
report the page rect and hide the surface when a host menu, dialog or popover
intersects it.

## Package entries

| Entry | Responsibility | Runtime dependency |
| --- | --- | --- |
| `.` | CDP recipes, snapshots/refs, event buffers, errors, contracts | Node/JS only |
| `./electron` | WebContentsView create/layout/visibility/focus/destroy | type-only Electron |
| `./refresh` | dependency discovery, plan selection, CSS swap | Node only |

The Electron adapter accepts the `WebContentsView` constructor from the host,
so importing the package does not load Electron or download its binary.

## Ownership rules

1. **One page per logical owner.** The host decides whether a session, tab or
   window is the owner. Do not create two live pages for the same owner.
2. **The host owns measurement.** Renderer CSS + scroll + clipping produce a
   viewport rect. The native view cannot be clipped by a CSS parent.
3. **The host owns visibility.** Hide the native view while a host overlay is
   drawn over the page; restore it when the overlay closes.
4. **The host owns focus handoff.** If the host is about to focus a composer,
   search box or dialog, focus the host window's `webContents` before
   dispatching the shortcut.
5. **The host owns the refresh schedule.** The package supplies a deterministic
   plan, not an application-wide watcher.

## Security posture

- Use a dedicated persistent partition per product context.
- Keep `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` and
  `webSecurity: true`.
- Validate URLs before navigation; do not treat the page as trusted input.
- Keep CDP debugger access in the main process; do not expose raw CDP to renderer
  content.
- Treat screenshots, console logs and page text as untrusted model input.
