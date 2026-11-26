import { BrowserError } from '../errors';
import type { ExecuteInPage } from './discovery';

export interface StylesheetRefreshOptions {
  /** Absolute stylesheet URL currently present in the document. */
  url: string;
  /** How long to wait for the replacement link to load. */
  timeoutMs?: number;
}

const DEFAULT_CSS_TIMEOUT_MS = 2_000;

const isSuccess = (value: unknown): value is { ok: true } => (
  typeof value === 'object'
  && value !== null
  && (value as { ok?: unknown }).ok === true
);

/**
 * Replace one directly linked stylesheet with a cache-busted clone.
 *
 * This is intentionally the only partial-update path. It never reloads the
 * document and therefore preserves DOM, JS and scroll state. The host must
 * verify that the stylesheet is uniquely linked and safe to swap before
 * calling it.
 */
export async function replaceStylesheet(
  executeJavaScript: ExecuteInPage,
  options: StylesheetRefreshOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CSS_TIMEOUT_MS;
  const replacement = new URL(options.url);
  replacement.searchParams.set('surface_refresh', String(Date.now()));
  const raw = await executeJavaScript(`(() => {
    const target = ${JSON.stringify(options.url)};
    const replacement = ${JSON.stringify(replacement.href)};
    const targetUrl = new URL(target);
    const matches = [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
      .filter((link) => {
        const href = new URL(link.href);
        return href.protocol === targetUrl.protocol
          && href.host === targetUrl.host
          && href.pathname === targetUrl.pathname;
      });
    if (matches.length !== 1) return { ok: false, reason: 'not-unique' };
    const oldLink = matches[0];
    const parent = oldLink.parentNode;
    if (!parent) return { ok: false, reason: 'no-parent' };
    const clone = oldLink.cloneNode(false);
    clone.href = replacement;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        clone.remove();
        finish({ ok: false, reason: 'timeout' });
      }, ${timeoutMs});
      clone.addEventListener('load', () => {
        if (!oldLink.isConnected) {
          clone.remove();
          finish({ ok: false, reason: 'detached' });
          return;
        }
        oldLink.remove();
        finish({ ok: true });
      }, { once: true });
      clone.addEventListener('error', () => {
        clone.remove();
        finish({ ok: false, reason: 'error' });
      }, { once: true });
      parent.insertBefore(clone, oldLink.nextSibling);
    });
  })()`);
  if (!isSuccess(raw)) {
    const reason = typeof raw === 'object' && raw !== null
      ? String((raw as { reason?: unknown }).reason ?? 'unknown')
      : 'invalid result';
    throw new BrowserError(`Stylesheet refresh failed: ${reason}`, {
      code: 'REFRESH_FAILED',
    });
  }
}
