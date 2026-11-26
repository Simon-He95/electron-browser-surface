import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type RefreshKind = 'document' | 'style' | 'script' | 'asset';

export interface FileSignature {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
}

export interface RefreshDependency {
  path: string;
  url: string;
  kind: RefreshKind;
  directStyle: boolean;
  directStyleCount: number;
  styleIntegrity: boolean;
  styleUnsafe: boolean;
  signature: FileSignature | null;
}

export interface ResourceHint {
  url: string;
  initiatorType?: string;
}

export interface DependencyDiscovery {
  documentUrl: string;
  styles: Array<{ url: string; integrity: boolean }>;
  scripts: string[];
  assets: string[];
  resources: ResourceHint[];
}

export type RefreshPlan =
  | { kind: 'none' }
  | { kind: 'css'; path: string }
  | { kind: 'reload' };

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

export const fileUrlToPath = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return undefined;
    parsed.search = '';
    parsed.hash = '';
    return fileURLToPath(parsed);
  } catch {
    return undefined;
  }
};

const classifyResource = (path: string): RefreshKind => {
  const extension = extname(path).toLowerCase();
  if (extension === '.css') return 'style';
  if (SCRIPT_EXTENSIONS.has(extension)) return 'script';
  return 'asset';
};

const addDependency = (
  dependencies: Map<string, RefreshDependency>,
  dependency: RefreshDependency,
): void => {
  const existing = dependencies.get(dependency.path);
  if (!existing || existing.kind === 'asset') {
    dependencies.set(dependency.path, dependency);
    return;
  }
  if (existing.kind === 'style' && dependency.kind === 'style') {
    existing.directStyle ||= dependency.directStyle;
    existing.directStyleCount = Math.max(existing.directStyleCount, dependency.directStyleCount);
    existing.styleIntegrity ||= dependency.styleIntegrity;
    existing.styleUnsafe ||= dependency.styleUnsafe;
  }
};

export const buildRefreshDependencies = (
  discovery: DependencyDiscovery,
  fallbackEntryUrl: string,
): Map<string, RefreshDependency> => {
  const dependencies = new Map<string, RefreshDependency>();
  const entryPath = fileUrlToPath(discovery.documentUrl) ?? fileUrlToPath(fallbackEntryUrl);
  if (!entryPath) return dependencies;

  dependencies.set(entryPath, {
    path: entryPath,
    url: discovery.documentUrl || fallbackEntryUrl,
    kind: 'document',
    directStyle: false,
    directStyleCount: 0,
    styleIntegrity: false,
    styleUnsafe: false,
    signature: null,
  });

  for (const style of discovery.styles) {
    const path = fileUrlToPath(style.url);
    if (!path || path === entryPath) continue;
    const previous = dependencies.get(path);
    addDependency(dependencies, {
      path,
      url: style.url,
      kind: 'style',
      directStyle: true,
      directStyleCount: previous?.kind === 'style' ? previous.directStyleCount + 1 : 1,
      styleIntegrity: style.integrity,
      styleUnsafe: false,
      signature: previous?.signature ?? null,
    });
  }

  for (const url of discovery.scripts) {
    const path = fileUrlToPath(url);
    if (!path || path === entryPath) continue;
    addDependency(dependencies, {
      path,
      url,
      kind: 'script',
      directStyle: false,
      directStyleCount: 0,
      styleIntegrity: false,
      styleUnsafe: false,
      signature: null,
    });
  }

  for (const url of discovery.assets) {
    const path = fileUrlToPath(url);
    if (!path || path === entryPath) continue;
    addDependency(dependencies, {
      path,
      url,
      kind: 'asset',
      directStyle: false,
      directStyleCount: 0,
      styleIntegrity: false,
      styleUnsafe: false,
      signature: null,
    });
  }

  for (const resource of discovery.resources) {
    const path = fileUrlToPath(resource.url);
    if (!path || path === entryPath) continue;
    const existing = dependencies.get(path);
    if (existing) {
      if (
        existing.kind === 'style'
        && existing.directStyle
        && resource.initiatorType !== undefined
        && resource.initiatorType !== 'link'
      ) {
        existing.styleUnsafe = true;
      }
      continue;
    }
    addDependency(dependencies, {
      path,
      url: resource.url,
      kind: classifyResource(path),
      directStyle: false,
      directStyleCount: 0,
      styleIntegrity: false,
      styleUnsafe: false,
      signature: null,
    });
  }

  return dependencies;
};

export const selectRefreshPlan = (input: {
  pendingReload: boolean;
  pendingStyles: ReadonlySet<string>;
  dependencies: ReadonlyMap<string, RefreshDependency>;
}): RefreshPlan => {
  if (input.pendingReload) return { kind: 'reload' };
  if (input.pendingStyles.size === 0) return { kind: 'none' };
  if (input.pendingStyles.size > 1) return { kind: 'reload' };

  const path = input.pendingStyles.values().next().value;
  const dependency = path === undefined ? undefined : input.dependencies.get(path);
  if (
    !dependency
    || dependency.kind !== 'style'
    || !dependency.directStyle
    || dependency.directStyleCount !== 1
    || dependency.styleIntegrity
    || dependency.styleUnsafe
  ) {
    return { kind: 'reload' };
  }

  return { kind: 'css', path: dependency.path };
};

export const signatureFromStat = (value: {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
}): FileSignature => ({
  mtimeMs: value.mtimeMs,
  ctimeMs: value.ctimeMs,
  size: value.size,
});

export const signaturesEqual = (
  left: FileSignature | null,
  right: FileSignature | null,
): boolean => (
  left === right
  || (
    left !== null
    && right !== null
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.size === right.size
  )
);

export const signatureMapKey = (
  signatures: ReadonlyMap<string, FileSignature | null>,
): string => [...signatures]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, signature]) => (
    signature === null
      ? `${path}:missing`
      : `${path}:${signature.mtimeMs}:${signature.ctimeMs}:${signature.size}`
  ))
  .join('|');

export const dependencySignatureKey = (
  dependencies: ReadonlyMap<string, RefreshDependency>,
): string => signatureMapKey(new Map(
  [...dependencies].map(([path, dependency]) => [path, dependency.signature]),
));

const readString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.length > 0 ? value : undefined
);

const readStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(readString).filter((item): item is string => item !== undefined)
    : []
);

export const parseDependencyDiscovery = (value: unknown): DependencyDiscovery | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const documentUrl = readString(record.documentUrl);
  if (!documentUrl) return undefined;

  const styles = Array.isArray(record.styles)
    ? record.styles.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const style = item as Record<string, unknown>;
      const url = readString(style.url);
      return url ? [{ url, integrity: style.integrity === true }] : [];
    })
    : [];

  const resources = Array.isArray(record.resources)
    ? record.resources.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const resource = item as Record<string, unknown>;
      const url = readString(resource.url);
      if (!url) return [];
      const initiatorType = readString(resource.initiatorType);
      return [initiatorType === undefined ? { url } : { url, initiatorType }];
    })
    : [];

  return {
    documentUrl,
    styles,
    scripts: readStringArray(record.scripts),
    assets: readStringArray(record.assets),
    resources,
  };
};
