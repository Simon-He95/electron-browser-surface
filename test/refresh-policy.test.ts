import { describe, expect, it } from 'vitest';
import {
  buildRefreshDependencies,
  parseDependencyDiscovery,
  selectRefreshPlan,
  type DependencyDiscovery,
} from '../src/refresh';

const discovery: DependencyDiscovery = {
  documentUrl: 'file:///tmp/demo/index.html',
  styles: [
    { url: 'file:///tmp/demo/site.css', integrity: false },
    { url: 'file:///tmp/demo/other.css', integrity: false },
  ],
  scripts: ['file:///tmp/demo/app.mjs'],
  assets: ['file:///tmp/demo/logo.svg'],
  resources: [],
};

describe('refresh policy', () => {
  it('allows the CSS fast path only for one direct stylesheet', () => {
    const dependencies = buildRefreshDependencies(discovery, discovery.documentUrl);
    const css = selectRefreshPlan({
      pendingReload: false,
      pendingStyles: new Set(['/tmp/demo/site.css']),
      dependencies,
    });
    expect(css).toEqual({ kind: 'css', path: '/tmp/demo/site.css' });

    const oneStyle = buildRefreshDependencies({
      ...discovery,
      styles: [discovery.styles[0]!],
    }, discovery.documentUrl);
    expect(selectRefreshPlan({
      pendingReload: false,
      pendingStyles: new Set(['/tmp/demo/site.css']),
      dependencies: oneStyle,
    })).toEqual({ kind: 'css', path: '/tmp/demo/site.css' });
  });

  it('falls back to reload for scripts, multiple styles and integrity links', () => {
    const dependencies = buildRefreshDependencies(discovery, discovery.documentUrl);
    expect(selectRefreshPlan({
      pendingReload: false,
      pendingStyles: new Set(['site.css', 'other.css']),
      dependencies,
    })).toEqual({ kind: 'reload' });
    expect(selectRefreshPlan({
      pendingReload: true,
      pendingStyles: new Set(),
      dependencies,
    })).toEqual({ kind: 'reload' });

    const integrity = buildRefreshDependencies({
      ...discovery,
      styles: [{ url: discovery.styles[0]!.url, integrity: true }],
    }, discovery.documentUrl);
    expect(selectRefreshPlan({
      pendingReload: false,
      pendingStyles: new Set(['/tmp/demo/site.css']),
      dependencies: integrity,
    })).toEqual({ kind: 'reload' });
  });

  it('validates external dependency discovery data', () => {
    expect(parseDependencyDiscovery({ documentUrl: 'file:///tmp/index.html', styles: [{ url: 'file:///tmp/a.css' }] })).toMatchObject({
      documentUrl: 'file:///tmp/index.html',
      styles: [{ url: 'file:///tmp/a.css', integrity: false }],
      scripts: [],
      assets: [],
      resources: [],
    });
    expect(parseDependencyDiscovery({ styles: [] })).toBeUndefined();
  });
});
