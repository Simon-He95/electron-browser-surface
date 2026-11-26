import { describe, expect, it } from 'vitest';
import { BrowserEventBuffers } from '../src/event-buffers';

describe('browser event buffers', () => {
  it('normalizes console values and supports clear', () => {
    const buffers = new BrowserEventBuffers();
    buffers.handleDebuggerMessage('Runtime.consoleAPICalled', {
      type: 'warning',
      args: [{ type: 'string', value: 'hello' }, { type: 'number', description: '42' }],
      timestamp: 123,
    });
    expect(buffers.readConsole(false)).toEqual([{ type: 'warn', text: 'hello 42', timestamp: 123 }]);
    expect(buffers.readConsole(true)).toHaveLength(1);
    expect(buffers.readConsole(false)).toHaveLength(0);
  });

  it('keeps page errors and bounds both buffers', () => {
    const buffers = new BrowserEventBuffers();
    for (let index = 0; index < 501; index += 1) {
      buffers.handleDebuggerMessage('Runtime.exceptionThrown', {
        exceptionDetails: { text: `error-${index}` },
      });
    }
    const errors = buffers.readErrors(false);
    expect(errors).toHaveLength(500);
    expect(errors[0]?.text).toBe('error-1');
    buffers.clear();
    expect(buffers.readErrors(false)).toHaveLength(0);
  });
});
