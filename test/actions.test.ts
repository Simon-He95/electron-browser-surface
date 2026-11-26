import { describe, expect, it, vi } from 'vitest';
import {
  clickNode,
  fillNode,
  pressKey,
  scrollPage,
  evaluateExpression,
  assertCdpMethodAllowed,
} from '../src/actions';
import { BrowserEvalError } from '../src/errors';
import type { CdpSend } from '../src/actions';

describe('semantic CDP actions', () => {
  it('clicks the center of the resolved node', async () => {
    const send = vi.fn(async (method: string) => {
      if (method === 'DOM.getBoxModel') return { model: { content: [10, 20, 30, 20, 30, 40, 10, 40] } };
      return undefined;
    });
    await clickNode(send as unknown as CdpSend, '@e1', 42);
    expect(send).toHaveBeenCalledWith('DOM.scrollIntoViewIfNeeded', { backendNodeId: 42 });
    expect(send).toHaveBeenCalledWith('Input.dispatchMouseEvent', expect.objectContaining({
      type: 'mousePressed', x: 20, y: 30,
    }));
    expect(send).toHaveBeenCalledWith('Input.dispatchMouseEvent', expect.objectContaining({
      type: 'mouseReleased', x: 20, y: 30,
    }));
  });

  it('fills via focus, select-all and insertText', async () => {
    const send = vi.fn(async () => undefined);
    await fillNode(send as unknown as CdpSend, 'e1', 7, 'hello');
    expect(send).toHaveBeenCalledWith('DOM.focus', { backendNodeId: 7 });
    expect(send).toHaveBeenCalledWith('Input.insertText', { text: 'hello' });
  });

  it('presses named keys and rejects unknown combinations', async () => {
    const send = vi.fn(async () => undefined);
    await pressKey(send as unknown as CdpSend, 'Control+a');
    expect(send).toHaveBeenCalledWith('Input.dispatchKeyEvent', expect.objectContaining({
      key: 'a', modifiers: 2,
    }));
    await expect(pressKey(send as unknown as CdpSend, 'Hyper+x')).rejects.toMatchObject({ code: 'INVALID_KEY' });
  });

  it('scrolls the page with a signed amount', async () => {
    const send = vi.fn(async () => undefined);
    await scrollPage(send as unknown as CdpSend, 'down', 120);
    expect(send).toHaveBeenCalledWith('Runtime.evaluate', {
      expression: 'window.scrollBy(0, 120)',
    });
  });

  it('converts page evaluation errors into BrowserEvalError', async () => {
    const send = vi.fn(async () => ({
      exceptionDetails: { text: 'boom', lineNumber: 3, columnNumber: 4 },
    }));
    await expect(evaluateExpression(send as unknown as CdpSend, 'throw new Error("boom")')).rejects.toBeInstanceOf(BrowserEvalError);
  });

  it('blocks browser-level CDP domains', () => {
    expect(() => assertCdpMethodAllowed('Page.reload')).not.toThrow();
    expect(() => assertCdpMethodAllowed('Browser.close')).toThrow(/disabled/);
    expect(() => assertCdpMethodAllowed('Target.createTarget')).toThrow(/disabled/);
  });
});
