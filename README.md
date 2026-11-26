# electron-browser-surface

A host-neutral CDP browser automation layer plus a reusable Electron
`WebContentsView` surface.

It is for Electron apps that need an embedded browser controlled by an agent,
an MCP server, a test runner or a command palette — without putting a
`<webview>` in the renderer or taking OS keyboard focus away from the host
composer.

- **No host framework dependency** — no Vue, React, Pinia or app-specific store.
- **CDP recipes** — navigate, snapshot/refs, click, fill, press, scroll, wait,
  eval, screenshot, console/errors and a guarded raw CDP escape hatch.
- **Native surface** — a `WebContentsView` lifecycle adapter for Electron 30+.
- **Refresh policy** — dependency discovery, CSS fast path and explicit
  full-reload fallback. It does **not** pretend to implement generic ESM HMR.
- **MIT licensed** — designed to be embedded by other applications.

## Requirements

- Node.js 20+
- Electron 30+ for the `./electron` entry
- A host agent/tool runtime for the semantic actions (this package is the
  browser layer, not an LLM)

## Install

```bash
pnpm add @simon_he/electron-browser-surface
# Electron is an optional peer:
pnpm add -D electron
```

## How it works

```text
Agent / tool loop / MCP / test script
        │
        │  BrowserRuntime: navigate / snapshot / click / fill / ...
        ▼
Host application (Electron main process)
        │  CDP transport (webContents.debugger.sendCommand)
        │  lifecycle, focus, visibility and refresh policy
        ▼
WebContentsView ── child of BrowserWindow.contentView
        │
        └─ normal Chromium page: DOM, AX, resource timing, file://

Host renderer (optional)
        └─ reports the page rect and whether a host overlay is covering it;
           calls surface.setBounds / surface.setVisible / surface.focus
```

The page remains a normal `WebContents`. Host UI is a renderer behind the
native view, so the host must explicitly hide the native surface while a host
dialog, popover or menu is drawn over that area.

## API surface

### `@simon_he/electron-browser-surface`

- semantic CDP helpers: `clickNode`, `fillNode`, `pressKey`, `scrollPage`,
  `evaluateExpression`, `waitForCondition`
- `buildSnapshot` / `RefMap` from a CDP `Accessibility.getFullAXTree` result
- `BrowserEventBuffers`
- typed errors such as `BrowserRefStaleError` and `BrowserCdpError`
- `BrowserRuntime`, `BrowserPageState` and `BrowserSnapshot` contracts
- secure `BROWSER_SECURE_WEB_PREFERENCES`

### `@simon_he/electron-browser-surface/electron`

- `createBrowserSurface({ window, viewConstructor, partition, preload? })`
- `surface.setBounds`, `surface.setVisible`, `surface.focus`, `surface.destroy`
- `clipRectToWindowContent` for host layout animations
- `handBackHostFocus` for operations that unexpectedly take OS focus

The constructor is injected (`WebContentsView`) so the module has no runtime
`electron` import and can be loaded by tests/tooling.

### `@simon_he/electron-browser-surface/refresh`

- `discoverRefreshDependencies`
- `buildRefreshDependencies`
- `selectRefreshPlan`
- `replaceStylesheet`
- file signature and dependency-signature helpers

The host owns the file watcher, visibility/lease policy and `reload()` call.
The package owns the policy and the safe CSS replacement primitive.

## Lifecycle

```text
create surface (hidden)
  → host measures rect
  → setBounds + setVisible(true)
  → navigate / load
  → did-finish-load
  → user or agent actions
  → host overlay / panel hidden: setVisible(false)
  → host overlay closed / panel visible: setVisible(true)
  → reload: same surface, same WebContents when possible
  → crash / host destroyed / explicit close
  → removeChildView + webContents.close
```

Read [the lifecycle guide](docs/lifecycle.md) for focus, visibility, crashes
and multi-window ownership. The surface adapter intentionally does not know
your DOM overlay structure; the host must report the visible page rect and
hide the native view when a host overlay intersects it.

## Refresh: on demand, not “everything reload”

The refresh entry is deliberately granular:

| Change | Result |
| --- | --- |
| one direct `<link rel="stylesheet">` | cache-busted stylesheet swap; DOM/JS state preserved |
| multiple styles or `@import` CSS | full reload |
| JS / ESM | full reload |
| HTML | full reload |
| image/font/other asset | full reload |

There is no generic ESM HMR. Already-executed browser modules have no safe
module invalidation API; a cache-busted `import()` creates a new module instance
and repeats top-level side effects. The host should reload for JS/ESM changes.
See [refresh design](docs/refresh.md) and
[the policy tests](test/refresh-policy.test.ts).

## Demo

The demo is a real Electron app with a native surface, scripted CDP actions, a
host overlay and a CSS fast-path refresh button:

```bash
pnpm install
pnpm demo
```

The demo uses:
- a host Electron window;
- a native `WebContentsView` created by the package;
- a local `demo.html` page;
- a scripted “agent” that attaches CDP, snapshots, clicks, fills and scrolls;
- a host overlay that hides the native surface;
- a CSS update that uses the partial stylesheet path.

It intentionally does **not** need an LLM or a model key. Replace the scripted
agent with your own tool loop or MCP server.

## Pairing with CUA / computer use

CUA is optional. Use the semantic browser API for page DOM work. Use a
computer-use driver only when crossing into OS-native UI, such as file pickers,
permission prompts, browser chrome outside the embedded page or inaccessible
canvas content. See [the CUA pairing example](examples/with-cua/README.md).

The package is also a natural fit for:
- an MCP browser tool;
- a Claude/OpenAI-style tool-calling loop;
- Playwright-like test scripts that need a real Electron surface;
- Electron apps that want one shared page per session.

## Documentation

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Lifecycle and focus](docs/lifecycle.md)
- [Refresh policy](docs/refresh.md)
- [Integration guide](docs/integration.md)
- [Demo guide](docs/demo.md)
- [Contributing](CONTRIBUTING.md)
- [Releasing](docs/releasing.md)
- [Security](SECURITY.md)

## Status and compatibility

The core is carrier-independent and the Electron adapter is tested against
Electron 43.6. The public API is intentionally small; internal host details
(session registries, app stores, UI overlay selectors) stay in the host app.
Windows/Linux behavior should be exercised in the host application because
window focus and native view bounds are platform-sensitive.

## License

MIT. See [LICENSE](LICENSE).
