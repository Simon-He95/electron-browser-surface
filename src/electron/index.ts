import type { BrowserWindow, WebContents, WebContentsView } from 'electron';
import { BROWSER_SECURE_WEB_PREFERENCES } from '../web-preferences';

export interface BrowserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserSurfaceOptions {
  /** Electron window that owns the native view. */
  window: BrowserWindow;
  /** Electron's WebContentsView constructor, injected to keep this module runtime-import-free. */
  viewConstructor: typeof WebContentsView;
  /** Session partition shared by the host's browser pages. */
  partition: string;
  /** Optional preload used for page instrumentation. */
  preload?: string;
  /** Start hidden until the host measures the surface. */
  visible?: boolean;
}

export interface BrowserSurface {
  readonly view: WebContentsView;
  readonly webContents: WebContents;
  setBounds(rect: BrowserRect): void;
  setVisible(visible: boolean): void;
  focus(): void;
  destroy(): Promise<void>;
}

const normalizeRect = (rect: BrowserRect): BrowserRect => ({
  x: Math.max(0, Math.round(rect.x)),
  y: Math.max(0, Math.round(rect.y)),
  width: Math.max(0, Math.round(rect.width)),
  height: Math.max(0, Math.round(rect.height)),
});

/**
 * A never-shown page still needs a positive layout viewport: CDP snapshot,
 * eval and screenshot run while the host panel is hidden, and a 0×0 view makes
 * every document measure 0. The first host surface report replaces these
 * bounds.
 */
const INITIAL_BOUNDS: BrowserRect = { x: 0, y: 0, width: 1280, height: 800 };

/**
 * Clip a renderer-space surface rect to the window content area.
 *
 * Native views are not clipped by CSS overflow; hosts should call this before
 * `setBounds` when a layout animation or a partially offscreen host can produce
 * a rect outside the content area.
 */
export function clipRectToWindowContent(
  window: BrowserWindow,
  rect: BrowserRect,
): BrowserRect | undefined {
  if (window.isDestroyed()) return undefined;
  const [contentWidth = 0, contentHeight = 0] = window.getContentSize();
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(contentWidth, rect.x + rect.width);
  const bottom = Math.min(contentHeight, rect.y + rect.height);
  return right - left > 1 && bottom - top > 1
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : undefined;
}

/**
 * Create a page that is a native child of the host window.
 *
 * The view is deliberately not focused here. CDP Input.* is delivered to the
 * target WebContents without making the native view the OS focus owner, which
 * lets a host composer keep its IME composition while an agent operates the page.
 */
export function createBrowserSurface(options: BrowserSurfaceOptions): BrowserSurface {
  const view = new options.viewConstructor({
    webPreferences: {
      ...BROWSER_SECURE_WEB_PREFERENCES,
      partition: options.partition,
      ...(options.preload === undefined ? {} : { preload: options.preload }),
      focusOnNavigation: false,
    },
  });
  const contents = view.webContents;
  view.setBounds(normalizeRect(INITIAL_BOUNDS));
  view.setVisible(options.visible ?? false);
  options.window.contentView.addChildView(view);

  let closed = false;
  return {
    view,
    webContents: contents,
    setBounds(rect) {
      if (contents.isDestroyed()) return;
      view.setBounds(normalizeRect(rect));
    },
    setVisible(visible) {
      if (contents.isDestroyed()) return;
      view.setVisible(visible);
    },
    focus() {
      if (!contents.isDestroyed()) contents.focus();
    },
    async destroy() {
      if (closed) return;
      closed = true;
      if (!options.window.isDestroyed()) {
        try {
          options.window.contentView.removeChildView(view);
        } catch {
          // The window may already be tearing down its view tree.
        }
      }
      if (!contents.isDestroyed()) contents.close();
    },
  };
}

/**
 * Restore host keyboard focus only when the host owned it before the operation
 * and the page took it away. This is a best-effort safety net; CDP input must
 * not depend on page focus.
 */
export function handBackHostFocus(
  host: WebContents,
  hostWasFocused: boolean,
  page?: WebContents,
): void {
  if (!hostWasFocused || host.isDestroyed() || host.isFocused()) return;
  if (page && !page.isFocused()) return;
  host.focus();
}
