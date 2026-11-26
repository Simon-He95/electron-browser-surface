import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { clipRectToWindowContent, createBrowserSurface, handBackHostFocus } from '../src/electron';

class MockContents extends EventEmitter {
  destroyed = false;
  focused = false;
  focus = vi.fn(() => { this.focused = true; });
  isDestroyed = () => this.destroyed;
  isFocused = () => this.focused;
  close = () => { this.destroyed = true; this.emit('destroyed'); };
}

class MockView {
  webContents = new MockContents();
  setBounds = vi.fn();
  setVisible = vi.fn();
}

describe('Electron browser surface', () => {
  it('creates a hidden, sized view and forwards visibility/bounds', async () => {
    const window = {
      isDestroyed: () => false,
      getContentSize: () => [800, 600],
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    } as unknown as BrowserWindow;
    const surface = createBrowserSurface({
      window,
      viewConstructor: MockView as never,
      partition: 'persist:test',
    });
    expect(surface.view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0, height: 0 });
    surface.setBounds({ x: 10.4, y: 20.6, width: 300.2, height: 200.8 });
    expect(surface.view.setBounds).toHaveBeenLastCalledWith({ x: 10, y: 21, width: 300, height: 201 });
    surface.setVisible(true);
    expect(surface.view.setVisible).toHaveBeenLastCalledWith(true);
    await surface.destroy();
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(surface.view);
    expect(surface.webContents.isDestroyed()).toBe(true);
  });

  it('clips rects to the content area', () => {
    const window = {
      isDestroyed: () => false,
      getContentSize: () => [800, 600],
    } as unknown as BrowserWindow;
    expect(clipRectToWindowContent(window, { x: -10, y: -20, width: 900, height: 700 }))
      .toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(clipRectToWindowContent(window, { x: 900, y: 0, width: 10, height: 10 })).toBeUndefined();
  });

  it('only hands focus back when the host owned it and the page took it', () => {
    const host = new MockContents();
    const page = new MockContents();
    host.focused = false;
    page.focused = true;
    handBackHostFocus(host as never, true, page as never);
    expect(host.focus).toHaveBeenCalledOnce();
    host.focus.mockClear();
    host.focused = true;
    handBackHostFocus(host as never, true, page as never);
    expect(host.focus).not.toHaveBeenCalled();
  });
});
