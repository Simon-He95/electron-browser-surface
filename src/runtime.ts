import type { BrowserSnapshot } from './snapshot';
import type { ConsoleMessage, PageError } from './event-buffers';
import type { WaitCondition } from './actions';

/**
 * Small, transport-neutral state projection for a browser page.
 * Hosts may add fields; the automation layer must not depend on them.
 */
export interface BrowserPageState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

/** A screenshot is returned as a host-owned reference, not raw pixels. */
export interface BrowserScreenshotRef {
  blobId: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}

export type BrowserSnapshotOptions = {
  interactiveOnly?: boolean;
  compact?: boolean;
  selector?: string;
};

export type BrowserScreenshotOptions = {
  fullPage?: boolean;
};

/**
 * The high-level contract an agent/tool layer consumes.
 *
 * This interface is intentionally Electron-free. Implement it with the
 * `./electron` adapter plus your host's CDP transport, or with any other
 * browser backend.
 */
export interface BrowserRuntime {
  navigate(url: string): Promise<BrowserPageState>;
  reload(): Promise<void>;
  getState(): BrowserPageState | undefined;

  snapshot(options?: BrowserSnapshotOptions): Promise<BrowserSnapshot>;
  screenshot(options?: BrowserScreenshotOptions): Promise<BrowserScreenshotRef>;
  console(options?: { clear?: boolean }): Promise<ConsoleMessage[]>;
  errors(options?: { clear?: boolean }): Promise<PageError[]>;

  click(ref: string): Promise<void>;
  fill(ref: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): Promise<void>;
  wait(condition: WaitCondition): Promise<void>;

  eval<T = unknown>(expression: string): Promise<T>;
  cdp<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}
