/**
 * Browser Event Buffers
 *
 * Collects `Runtime.consoleAPICalled` / `Runtime.exceptionThrown` CDP events
 * from debugger attach onward. Pull-based: the agent reads via console/errors
 * with an optional clear. Each buffer caps at 500 entries, dropping oldest.
 *
 * The host forwards `Runtime.consoleAPICalled` and `Runtime.exceptionThrown`
 * events from its CDP debugger. Buffers are pull-based and bounded.
 */

export interface ConsoleMessage {
  type: 'log' | 'error' | 'warn' | 'info';
  text: string;
  timestamp: number;
}

export interface PageError {
  text: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export const EVENT_BUFFER_LIMIT = 500;

interface RemoteObjectLike {
  type?: string;
  subtype?: string;
  value?: unknown;
  description?: string;
}

interface ConsoleApiCalledParams {
  type?: string;
  args?: RemoteObjectLike[];
  timestamp?: number;
}

interface ExceptionThrownParams {
  timestamp?: number;
  exceptionDetails?: {
    text?: string;
    lineNumber?: number;
    columnNumber?: number;
    url?: string;
    exception?: RemoteObjectLike;
  };
}

const serializeArg = (arg: RemoteObjectLike): string => {
  if (arg.type === 'string') {
    return String(arg.value);
  }
  if (arg.type === 'undefined') {
    return 'undefined';
  }
  if (arg.type === 'object' && arg.subtype === 'null') {
    return 'null';
  }
  return arg.description ?? JSON.stringify(arg.value) ?? 'undefined';
};

const mapConsoleType = (type: string | undefined): ConsoleMessage['type'] => {
  switch (type) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warn';
    case 'info':
      return 'info';
    default:
      return 'log';
  }
};

export class BrowserEventBuffers {
  private consoleMessages: ConsoleMessage[] = [];
  private pageErrors: PageError[] = [];

  /** Route a raw debugger `message` event into the buffers. */
  public handleDebuggerMessage(method: string, params: unknown): void {
    if (method === 'Runtime.consoleAPICalled') {
      this.pushConsole(params as ConsoleApiCalledParams);
    } else if (method === 'Runtime.exceptionThrown') {
      this.pushError(params as ExceptionThrownParams);
    }
  }

  /** Read buffered console messages; `clear` empties the buffer after reading. */
  public readConsole(clear: boolean): ConsoleMessage[] {
    const messages = [...this.consoleMessages];
    if (clear) {
      this.consoleMessages = [];
    }
    return messages;
  }

  /** Read buffered page errors; `clear` empties the buffer after reading. */
  public readErrors(clear: boolean): PageError[] {
    const errors = [...this.pageErrors];
    if (clear) {
      this.pageErrors = [];
    }
    return errors;
  }

  /** Empty both buffers (surface close / page switch / crash). */
  public clear(): void {
    this.consoleMessages = [];
    this.pageErrors = [];
  }

  private pushConsole(params: ConsoleApiCalledParams): void {
    const text = (params.args ?? []).map(serializeArg).join(' ');
    this.consoleMessages.push({
      type: mapConsoleType(params.type),
      text,
      timestamp: typeof params.timestamp === 'number' ? params.timestamp : Date.now(),
    });
    if (this.consoleMessages.length > EVENT_BUFFER_LIMIT) {
      this.consoleMessages.splice(0, this.consoleMessages.length - EVENT_BUFFER_LIMIT);
    }
  }

  private pushError(params: ExceptionThrownParams): void {
    const details = params.exceptionDetails;
    if (!details) {
      return;
    }
    this.pageErrors.push({
      text: details.exception?.description ?? details.text ?? 'Unknown page error',
      url: details.url,
      line: details.lineNumber,
      column: details.columnNumber,
      timestamp: typeof params.timestamp === 'number' ? params.timestamp : Date.now(),
    });
    if (this.pageErrors.length > EVENT_BUFFER_LIMIT) {
      this.pageErrors.splice(0, this.pageErrors.length - EVENT_BUFFER_LIMIT);
    }
  }
}
