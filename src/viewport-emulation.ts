import type { CdpSend } from './actions';

export type ViewportEmulationFailure = {
  method: 'Emulation.clearDeviceMetricsOverride' | 'Emulation.setPageScaleFactor';
  error: unknown;
};

/**
 * Tracks viewport-affecting CDP emulation applied through the raw `cdp` escape
 * hatch.
 *
 * The page is shared with the user's host surface. A device-metrics override
 * changes the page's layout viewport without giving the document horizontal
 * overflow, while the native view is still only as wide as the host panel. The
 * right side is then clipped and cannot be scrolled. Keep emulation for the
 * duration of the agent run, then clear it when the run ends or when a
 * user-visible surface appears outside a run.
 *
 * The host owns the CDP transport:
 *
 * - call `track()` only after the command resolved successfully;
 * - call `clear()` from the host's serialized browser operation queue, so an
 *   in-flight `Emulation.setDeviceMetricsOverride` cannot re-apply the override
 *   after the reset;
 * - call `reset()` when the page's debugger is detached or rebound.
 */
export class ViewportEmulationGuard {
  private viewportEmulated = false;
  private pageScaleEmulated = false;

  /** Whether a tracked override still needs clearing. */
  public get active(): boolean {
    return this.viewportEmulated || this.pageScaleEmulated;
  }

  public track(method: string): void {
    if (method === 'Emulation.setDeviceMetricsOverride') {
      this.viewportEmulated = true;
    } else if (method === 'Emulation.clearDeviceMetricsOverride') {
      this.viewportEmulated = false;
    } else if (method === 'Emulation.setPageScaleFactor') {
      this.pageScaleEmulated = true;
    }
  }

  /**
   * Forget overrides because CDP emulation belongs to the debugger session and
   * does not carry over to a new page or target.
   */
  public reset(): void {
    this.viewportEmulated = false;
    this.pageScaleEmulated = false;
  }

  /**
   * Clear the tracked overrides through the host transport. A failed command
   * keeps its flag so a later call can retry.
   */
  public async clear(
    send: CdpSend,
    onError?: (failure: ViewportEmulationFailure) => void,
  ): Promise<void> {
    const commands: Array<{
      key: 'viewportEmulated' | 'pageScaleEmulated';
      method: ViewportEmulationFailure['method'];
      invoke: () => Promise<unknown>;
    }> = [];
    if (this.viewportEmulated) {
      commands.push({
        key: 'viewportEmulated',
        method: 'Emulation.clearDeviceMetricsOverride',
        invoke: () => send('Emulation.clearDeviceMetricsOverride'),
      });
    }
    if (this.pageScaleEmulated) {
      commands.push({
        key: 'pageScaleEmulated',
        method: 'Emulation.setPageScaleFactor',
        invoke: () => send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }),
      });
    }
    const results = await Promise.allSettled(commands.map(command => command.invoke()));
    for (const [index, result] of results.entries()) {
      const command = commands[index]!;
      if (result.status === 'fulfilled') {
        this[command.key] = false;
      } else {
        onError?.({ method: command.method, error: result.reason });
      }
    }
  }
}
