/**
 * Browser Interactions — semantic operation executors
 *
 * Each executor runs a fixed CDP sequence through an injected `CdpSend`.
 * The host owns the transport (usually `webContents.debugger.sendCommand`),
 * which keeps the recipes unit-testable and independent of Electron.
 */

import {
  BrowserOperationError,
  BrowserCdpError,
  BrowserRefStaleError,
  BrowserEvalError,
  BrowserWaitTimeoutError,
} from './errors';

/** Sends one CDP command on the current page transport. Throws BrowserCdpError on failure. */
export type CdpSend = <T = unknown>(
  method: string,
  params?: Record<string, unknown>
) => Promise<T>;

export type WaitCondition =
  | { type: 'element'; ref: string; timeout?: number }
  | { type: 'text'; value: string; timeout?: number }
  | { type: 'url'; value: string; timeout?: number }
  | { type: 'load'; timeout?: number }
  | { type: 'ms'; value: number };

export const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
export const WAIT_POLL_INTERVAL_MS = 100;

/**
 * Fixed timeout for `screenshot`. A hidden or display:none page may have no
 * compositor frames, so `Page.captureScreenshot` can hang indefinitely even
 * with background throttling disabled. Fail fast instead of holding a host
 * operation open.
 */
export const SCREENSHOT_TIMEOUT_MS = DEFAULT_WAIT_TIMEOUT_MS;

/** Domains blocked on the cdp passthrough: browser-level operations are off-limits. */
const BLOCKED_CDP_DOMAINS = new Set(['Browser', 'Target']);

/**
 * Reject `Browser.*` / `Target.*` CDP methods on the cdp passthrough.
 * Throws BrowserCdpError explaining why the domain is disabled.
 */
export function assertCdpMethodAllowed(method: string): void {
  const domain = method.split('.')[0] ?? method;
  if (BLOCKED_CDP_DOMAINS.has(domain)) {
    throw new BrowserCdpError(
      `CDP domain '${domain}' is disabled: browser-level operations (closing windows, ` +
        `creating targets, changing browser configuration) are not allowed through cdp`
    );
  }
}

const ensureRefPrefix = (ref: string): string => (ref.startsWith('@') ? ref : `@${ref}`);

/**
 * Run a node-addressed CDP call; failures mean the backendNodeId no longer
 * resolves (or the node has no box), which the contract reports as a stale ref.
 */
const nodeCdp = async <T>(
  send: CdpSend,
  ref: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> => {
  try {
    return await send<T>(method, params);
  } catch {
    throw new BrowserRefStaleError(ensureRefPrefix(ref));
  }
};

interface BoxModelResult {
  model: { content: number[] };
}

/**
 * Scroll a node into view and return the viewport centre of its content box.
 *
 * Exported because callers may need the same point for UI feedback or for
 * actions that do not otherwise compute it (`fill` only focuses).
 */
export async function resolveNodeCenter(
  send: CdpSend,
  ref: string,
  backendNodeId: number,
): Promise<{ x: number; y: number }> {
  await nodeCdp(send, ref, 'DOM.scrollIntoViewIfNeeded', { backendNodeId });
  const { model } = await nodeCdp<BoxModelResult>(send, ref, 'DOM.getBoxModel', { backendNodeId });
  const content = model.content;
  return { x: (content[0]! + content[4]!) / 2, y: (content[1]! + content[5]!) / 2 };
}

/**
 * Click: scroll into view → box model → center point → mouse event sequence.
 *
 * `beforeDispatch` runs once the click point is known and before any mouse event
 * is sent. Hosts can use it to move a visible cursor overlay to the point. It is
 * awaited, so a slow hook delays the click — keep it bounded.
 */
export async function clickNode(
  send: CdpSend,
  ref: string,
  backendNodeId: number,
  beforeDispatch?: (point: { x: number; y: number }) => Promise<void>,
): Promise<void> {
  const { x, y } = await resolveNodeCenter(send, ref, backendNodeId);
  await beforeDispatch?.({ x, y });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

/**
 * Fill: focus → select-all → insert text.
 */
export async function fillNode(
  send: CdpSend,
  ref: string,
  backendNodeId: number,
  value: string
): Promise<void> {
  await nodeCdp(send, ref, 'DOM.focus', { backendNodeId });
  const selectAll = {
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...selectAll, commands: ['selectAll'] });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...selectAll });
  await send('Input.insertText', { text: value });
}

// --- press ---

const MODIFIER_BITS: Record<string, number> = {
  alt: 1,
  control: 2,
  ctrl: 2,
  meta: 4,
  cmd: 4,
  command: 4,
  shift: 8,
};

const NAMED_KEYS: Record<string, { key: string; code: string; windowsVirtualKeyCode: number }> = {
  enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
  end: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
};

export interface KeyCombo {
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  modifiers: number;
}

/**
 * Parse a key spec like 'Enter', 'Tab' or 'Control+a' into CDP key event params.
 * Unknown keys fail fast with BrowserOperationError.
 */
export function parseKeyCombo(spec: string): KeyCombo {
  const parts = spec.split('+');
  const keyPart = parts[parts.length - 1] ?? '';
  let modifiers = 0;
  for (const modifier of parts.slice(0, -1)) {
    const bit = MODIFIER_BITS[modifier.toLowerCase()];
    if (bit === undefined) {
      throw new BrowserOperationError('INVALID_KEY', `unsupported key modifier: ${modifier}`);
    }
    modifiers |= bit;
  }

  const named = NAMED_KEYS[keyPart.toLowerCase()];
  if (named) {
    return { ...named, modifiers };
  }
  if (/^[a-zA-Z]$/.test(keyPart)) {
    const upper = keyPart.toUpperCase();
    return {
      key: keyPart,
      code: `Key${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      modifiers,
    };
  }
  if (/^[0-9]$/.test(keyPart)) {
    return {
      key: keyPart,
      code: `Digit${keyPart}`,
      windowsVirtualKeyCode: keyPart.charCodeAt(0),
      modifiers,
    };
  }
  throw new BrowserOperationError('INVALID_KEY', `unsupported key: ${spec}`);
}

/**
 * Press: keyDown + keyUp with the mapped key.
 */
export async function pressKey(send: CdpSend, spec: string): Promise<void> {
  const combo = parseKeyCombo(spec);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...combo });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...combo });
}

/**
 * Scroll via `window.scrollBy`; amount defaults to one viewport.
 */
export async function scrollPage(
  send: CdpSend,
  direction: 'up' | 'down' | 'left' | 'right',
  amount?: number
): Promise<void> {
  const horizontal = direction === 'left' || direction === 'right';
  const magnitude =
    amount !== undefined ? String(amount) : horizontal ? 'window.innerWidth' : 'window.innerHeight';
  const signed = direction === 'up' || direction === 'left' ? `-(${magnitude})` : magnitude;
  const expression = horizontal ? `window.scrollBy(${signed}, 0)` : `window.scrollBy(0, ${signed})`;
  await send('Runtime.evaluate', { expression });
}

// --- eval ---

interface EvaluateResult {
  result?: { value?: unknown };
  exceptionDetails?: {
    text?: string;
    lineNumber?: number;
    columnNumber?: number;
    exception?: { description?: string };
  };
}

/**
 * Eval: `Runtime.evaluate` with returnByValue + awaitPromise.
 * Page exceptions become BrowserEvalError carrying exceptionDetails.
 */
export async function evaluateExpression<T = unknown>(
  send: CdpSend,
  expression: string
): Promise<T> {
  const result = await send<EvaluateResult>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const details = result.exceptionDetails;
  if (details) {
    throw new BrowserEvalError({
      text: details.exception?.description ?? details.text ?? 'Evaluation failed',
      line: details.lineNumber,
      column: details.columnNumber,
    });
  }
  return result.result?.value as T;
}

/**
 * Screenshot: `Page.captureScreenshot` as PNG, optionally beyond the viewport.
 *
 * Wrapped in a fixed timeout: a hidden webview has no compositor frames and
 * `Page.captureScreenshot` never resolves. On timeout we throw a
 * BrowserOperationError that points the agent at snapshot instead.
 */
export async function captureScreenshot(
  send: CdpSend,
  fullPage: boolean
): Promise<{ data: string }> {
  if (fullPage) {
    throw new BrowserOperationError(
      'FULL_PAGE_SCREENSHOT_UNSUPPORTED',
      'fullPage screenshot is not supported without implicit scrolling. ' +
        'Use the scroll action explicitly, then take viewport screenshots.'
    );
  }
  const params: Record<string, unknown> = {
    format: 'png',
    captureBeyondViewport: false,
  };

  return withScreenshotTimeout(send<{ data: string }>('Page.captureScreenshot', params));
}

const withScreenshotTimeout = async <T>(operation: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new BrowserOperationError(
          'SCREENSHOT_TIMEOUT',
          `screenshot timed out after ${SCREENSHOT_TIMEOUT_MS}ms. ` +
            `The page may be hidden (no compositor frames to capture). Use snapshot instead.`
        )
      );
    }, SCREENSHOT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

/**
 * Resolve a CSS selector to the set of backendNodeIds in its subtree
 * (snapshot scoping). Missing selector match fails fast.
 */
export async function resolveSelectorScope(
  send: CdpSend,
  selector: string
): Promise<Set<number>> {
  const evaluated = await send<{ result?: { objectId?: string } }>('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
    returnByValue: false,
  });
  const objectId = evaluated.result?.objectId;
  if (!objectId) {
    throw new BrowserOperationError(
      'SELECTOR_NOT_FOUND',
      `selector did not match any element: ${selector}`
    );
  }
  interface DescribedNode {
    backendNodeId?: number;
    children?: DescribedNode[];
    contentDocument?: DescribedNode;
  }
  const described = await send<{ node: DescribedNode }>('DOM.describeNode', {
    objectId,
    depth: -1,
  });
  const ids = new Set<number>();
  const collect = (node: DescribedNode | undefined): void => {
    if (!node) {
      return;
    }
    if (node.backendNodeId !== undefined) {
      ids.add(node.backendNodeId);
    }
    for (const child of node.children ?? []) {
      collect(child);
    }
    collect(node.contentDocument);
  };
  collect(described.node);
  return ids;
}

// --- wait ---

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const globToRegExp = (glob: string): RegExp => {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
};

const describeCondition = (condition: WaitCondition): string => {
  switch (condition.type) {
    case 'element':
      return `element=${ensureRefPrefix(condition.ref)}`;
    case 'text':
      return `text=${condition.value}`;
    case 'url':
      return `url=${condition.value}`;
    case 'load':
      return 'load';
    case 'ms':
      return `ms=${condition.value}`;
  }
}

/**
 * Wait: poll the condition every 100ms until satisfied or timeout
 * (default 30s) → BrowserWaitTimeoutError.
 *
 * `resolveBackendNodeId` resolves an element ref against the current RefMap
 * and throws BrowserRefStaleError for unknown refs.
 */
export async function waitForCondition(
  send: CdpSend,
  condition: WaitCondition,
  resolveBackendNodeId: (ref: string) => number,
  pollIntervalMs: number = WAIT_POLL_INTERVAL_MS,
  isLoadReady: () => boolean = () => true,
  checkStale?: () => Promise<void> | void,
): Promise<void> {
  if (condition.type === 'ms') {
    await sleep(condition.value);
    return;
  }

  const timeoutMs = condition.timeout ?? DEFAULT_WAIT_TIMEOUT_MS;
  let check: () => Promise<boolean>;

  switch (condition.type) {
    case 'element': {
      const backendNodeId = resolveBackendNodeId(condition.ref);
      check = async () => {
        try {
          await send('DOM.getBoxModel', { backendNodeId });
          return true;
        } catch {
          return false;
        }
      };
      break;
    }
    case 'text': {
      const expression = `document.body.innerText.includes(${JSON.stringify(condition.value)})`;
      check = async () => {
        const result = await send<EvaluateResult>('Runtime.evaluate', {
          expression,
          returnByValue: true,
        });
        return result.result?.value === true;
      };
      break;
    }
    case 'url': {
      const pattern = globToRegExp(condition.value);
      check = async () => {
        const result = await send<EvaluateResult>('Runtime.evaluate', {
          expression: 'window.location.href',
          returnByValue: true,
        });
        return typeof result.result?.value === 'string' && pattern.test(result.result.value);
      };
      break;
    }
    case 'load': {
      check = async () => {
        if (!isLoadReady()) return false;
        const result = await send<EvaluateResult>('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true,
        });
        return result.result?.value === 'complete';
      };
      break;
    }
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await checkStale?.();
    if (await check()) {
      return;
    }
    if (Date.now() + pollIntervalMs > deadline) {
      throw new BrowserWaitTimeoutError(timeoutMs, describeCondition(condition));
    }
    await sleep(pollIntervalMs);
  }
}
