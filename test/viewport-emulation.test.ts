import { describe, expect, it, vi } from 'vitest';
import { ViewportEmulationGuard } from '../src/viewport-emulation';
import type { CdpSend } from '../src/actions';

describe('viewport emulation guard', () => {
  it('tracks device metrics and page scale until they are cleared', async () => {
    const guard = new ViewportEmulationGuard();
    const sendMock = vi.fn(async () => undefined);
    const send = sendMock as unknown as CdpSend;

    await guard.clear(send);
    expect(sendMock).not.toHaveBeenCalled();

    guard.track('Emulation.setDeviceMetricsOverride');
    guard.track('Emulation.setPageScaleFactor');
    expect(guard.active).toBe(true);

    await guard.clear(send);
    expect(sendMock).toHaveBeenCalledWith('Emulation.clearDeviceMetricsOverride');
    expect(sendMock).toHaveBeenCalledWith('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    expect(guard.active).toBe(false);

    sendMock.mockClear();
    await guard.clear(send);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('keeps failed overrides for a later retry', async () => {
    const guard = new ViewportEmulationGuard();
    guard.track('Emulation.setDeviceMetricsOverride');
    const failures: string[] = [];
    const failing = vi.fn(async () => {
      throw new Error('transient');
    }) as unknown as CdpSend;

    await guard.clear(failing, failure => failures.push(failure.method));
    expect(failures).toEqual(['Emulation.clearDeviceMetricsOverride']);
    expect(guard.active).toBe(true);

    const send = vi.fn(async () => undefined) as unknown as CdpSend;
    await guard.clear(send);
    expect(send).toHaveBeenCalledWith('Emulation.clearDeviceMetricsOverride');
    expect(guard.active).toBe(false);
  });

  it('forgets overrides when the target is rebound', () => {
    const guard = new ViewportEmulationGuard();
    guard.track('Emulation.setDeviceMetricsOverride');
    guard.track('Emulation.clearDeviceMetricsOverride');
    expect(guard.active).toBe(false);

    guard.track('Emulation.setPageScaleFactor');
    guard.reset();
    expect(guard.active).toBe(false);
  });
});
