import { parseDependencyDiscovery, type DependencyDiscovery } from './policy';

/**
 * Run this in the page after a document finishes loading. It deliberately
 * returns plain JSON so the host can execute it with any CDP/Runtime bridge.
 */
export const DEPENDENCY_DISCOVERY_SCRIPT = `(() => {
  const styles = [];
  for (const link of document.querySelectorAll('link[rel~="stylesheet"][href]')) {
    styles.push({ url: link.href, integrity: link.hasAttribute('integrity') });
  }
  const scripts = [...document.querySelectorAll('script[src]')]
    .map((element) => element.src)
    .filter((url) => typeof url === 'string' && url.length > 0);
  const assets = [...document.querySelectorAll(
    'img[src],source[src],video[src],audio[src],iframe[src],object[data],embed[src]'
  )]
    .map((element) => element.src || element.data)
    .filter((url) => typeof url === 'string' && url.length > 0);
  const resources = typeof performance === 'undefined'
    ? []
    : performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      initiatorType: entry.initiatorType || undefined,
    }));
  return { documentUrl: document.URL, styles, scripts, assets, resources };
})()`;

export type ExecuteInPage = (expression: string) => Promise<unknown>;

/**
 * Discover the `file://` resources loaded by the current document.
 *
 * The caller owns the page transport; the result is validated at this boundary
 * before it is passed to the refresh policy.
 */
export async function discoverRefreshDependencies(
  executeJavaScript: ExecuteInPage,
): Promise<DependencyDiscovery | undefined> {
  return parseDependencyDiscovery(await executeJavaScript(DEPENDENCY_DISCOVERY_SCRIPT));
}
