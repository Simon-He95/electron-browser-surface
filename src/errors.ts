/**
 * A stable, host-neutral error surface for browser automation.
 *
 * The package deliberately does not extend an application-specific error
 * class. Consumers can still branch on `code` and use `instanceof`
 * `BrowserError` for the library boundary.
 */
export interface BrowserErrorOptions {
  code: string;
  cause?: unknown;
}

export class BrowserError extends Error {
  public readonly code: string;

  constructor(message: string, options: BrowserErrorOptions) {
    super(message);
    this.name = 'BrowserError';
    this.code = options.code;
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
  }
}

/** A browser operation failed before a more specific error could be classified. */
export class BrowserOperationError extends BrowserError {
  constructor(code: string, message: string, options: { cause?: unknown } = {}) {
    super(message, { code, cause: options.cause });
    this.name = 'BrowserOperationError';
  }
}

/** A Chrome DevTools Protocol command failed. */
export class BrowserCdpError extends BrowserError {
  public readonly cdpCode: number | undefined;
  public readonly cdpMessage: string | undefined;

  constructor(
    message: string,
    options: { cdpCode?: number; cdpMessage?: string; cause?: unknown } = {},
  ) {
    super(message, { code: 'CDP_ERROR', cause: options.cause });
    this.name = 'BrowserCdpError';
    this.cdpCode = options.cdpCode;
    this.cdpMessage = options.cdpMessage;
  }
}

/**
 * Thrown when an `@eN` ref is not in the current RefMap or node resolution
 * fails. The message intentionally contains the exact recovery action.
 */
export class BrowserRefStaleError extends BrowserError {
  public readonly ref: string;

  constructor(ref: string) {
    super(`Ref ${ref} is stale. Run snapshot again.`, { code: 'REF_STALE' });
    this.name = 'BrowserRefStaleError';
    this.ref = ref;
  }
}

/** Thrown when an evaluated expression throws inside the page. */
export class BrowserEvalError extends BrowserError {
  public readonly text: string;
  public readonly line: number | undefined;
  public readonly column: number | undefined;

  constructor(details: { text: string; line?: number; column?: number }) {
    const parts: string[] = [];
    if (details.line !== undefined) parts.push(`line ${details.line}`);
    if (details.column !== undefined) parts.push(`column ${details.column}`);
    const location = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    super(`eval failed: ${details.text}${location}`, { code: 'EVAL_ERROR' });
    this.name = 'BrowserEvalError';
    this.text = details.text;
    this.line = details.line;
    this.column = details.column;
  }
}

/** A wait condition did not become true before its deadline. */
export class BrowserWaitTimeoutError extends BrowserError {
  public readonly timeoutMs: number;
  public readonly condition: string;

  constructor(timeoutMs: number, condition: string) {
    super(`Wait timed out after ${timeoutMs}ms: ${condition}`, { code: 'WAIT_TIMEOUT' });
    this.name = 'BrowserWaitTimeoutError';
    this.timeoutMs = timeoutMs;
    this.condition = condition;
  }
}
