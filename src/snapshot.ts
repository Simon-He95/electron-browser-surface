/**
 * Browser Snapshot — pure functions
 *
 * Converts an `Accessibility.getFullAXTree` result into the indented text
 * snapshot + `@eN` RefMap defined by the snapshot contract. No CDP calls
 * happen here; the service feeds in the raw AX node array.
 *
 * The host supplies a `Accessibility.getFullAXTree` result; this module turns
 * it into deterministic model-readable text and a ref map.
 */

// --- CDP Accessibility.getFullAXTree result shapes (subset we consume) ---

export interface AXValue {
  value?: unknown;
}

export interface AXProperty {
  name: string;
  value: AXValue;
}

export interface AXNodeData {
  nodeId: string;
  ignored?: boolean;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

// --- Snapshot output contract ---

export interface RefEntry {
  /** Ref key without the `@` prefix, e.g. "e1". */
  ref: string;
  backendNodeId: number;
  role: string;
  name: string;
  /** 1-based disambiguation index when role+name repeats; undefined otherwise. */
  nth: number | undefined;
}

export type RefMap = Map<string, RefEntry>;

export interface BrowserSnapshot {
  text: string;
  refCount: number;
}

export interface BuildSnapshotInput {
  nodes: AXNodeData[];
  url: string;
  title: string;
  /** When set (selector scoping), only subtrees whose root backendDOMNodeId is in this set are rendered. */
  scopeBackendNodeIds?: Set<number>;
  interactiveOnly?: boolean;
  compact?: boolean;
}

export interface BuildSnapshotResult extends BrowserSnapshot {
  refs: RefMap;
}

// --- Role classification ---

export type RoleCategory = 'INTERACTIVE' | 'CONTENT' | 'STRUCTURAL';

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'textfield',
  'searchbox',
  'searchfield',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'togglebutton',
  'popupbutton',
]);

const CONTENT_ROLES = new Set([
  'heading',
  'statictext',
  'text',
  'paragraph',
  'image',
  'img',
  'listitem',
  'listmarker',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'caption',
  'figcaption',
  'blockquote',
  'code',
  'term',
  'definition',
  'alert',
  'status',
  'tooltip',
  'time',
  'note',
]);

/** Roles that exist as AX tree roots/containers and are never rendered. */
const ROOT_ROLES = new Set(['rootwebarea', 'webarea']);

/** Leaf text fragments duplicated from their parent StaticText; always skipped. */
const SKIPPED_ROLES = new Set(['inlinetextbox']);

export function classifyRole(role: string): RoleCategory {
  const normalized = role.toLowerCase();
  if (INTERACTIVE_ROLES.has(normalized)) {
    return 'INTERACTIVE';
  }
  if (CONTENT_ROLES.has(normalized)) {
    return 'CONTENT';
  }
  return 'STRUCTURAL';
}

// --- Rendering ---

/** Properties inlined after the name, e.g. `placeholder="..."` or `checked=true`. */
const INLINE_PROPERTIES = new Set([
  'placeholder',
  'checked',
  'disabled',
  'expanded',
  'selected',
  'required',
  'level',
  'url',
  'valuetext',
]);

interface RenderItem {
  depth: number;
  role: string;
  name: string;
  refEntry: RefEntry | undefined;
  inlineProps: string[];
  value: string | undefined;
}

const asString = (value: AXValue | undefined): string => {
  const raw = value?.value;
  return typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw);
};

const formatPropertyValue = (value: unknown): string => {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(String(value));
};

/**
 * Build the snapshot text and RefMap from a full AX tree.
 *
 * Ref assignment: every INTERACTIVE node with a backendDOMNodeId gets a ref;
 * CONTENT nodes get a ref when they carry a non-empty name. STRUCTURAL nodes
 * never get refs. Duplicate role+name pairs are disambiguated with a 1-based
 * `[n]` suffix.
 */
export function buildSnapshot(input: BuildSnapshotInput): BuildSnapshotResult {
  const { nodes, url, title, scopeBackendNodeIds, interactiveOnly = false, compact = false } = input;

  const nodeById = new Map<string, AXNodeData>();
  for (const node of nodes) {
    nodeById.set(node.nodeId, node);
  }
  const root = nodes.find((node) => node.parentId === undefined) ?? nodes[0];

  const items: RenderItem[] = [];
  const refs: RefMap = new Map();
  let refCounter = 0;

  const visit = (nodeId: string, depth: number, inScope: boolean, parentName: string): void => {
    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    const role = asString(node.role).toLowerCase();
    const name = asString(node.name);

    // Selector scoping: descend without rendering until a subtree root matches.
    if (!inScope) {
      const matches =
        node.backendDOMNodeId !== undefined && scopeBackendNodeIds!.has(node.backendDOMNodeId);
      if (matches) {
        visit(nodeId, depth, true, parentName);
      } else {
        for (const childId of node.childIds ?? []) {
          visit(childId, depth, false, parentName);
        }
      }
      return;
    }

    if (SKIPPED_ROLES.has(role)) {
      return;
    }

    if (node.ignored || ROOT_ROLES.has(role)) {
      for (const childId of node.childIds ?? []) {
        visit(childId, depth, true, parentName);
      }
      return;
    }

    // Skip StaticText fragments repeating the parent's accessible name.
    if (role === 'statictext' && name !== '' && name === parentName) {
      return;
    }

    const category = classifyRole(role);
    const rendered = interactiveOnly
      ? category === 'INTERACTIVE'
      : category === 'STRUCTURAL'
        ? !(compact && name === '')
        : category === 'CONTENT'
          ? name !== ''
          : true;

    let refEntry: RefEntry | undefined;
    if (rendered) {
      const wantsRef =
        category === 'INTERACTIVE' || (category === 'CONTENT' && name !== '');
      if (wantsRef && node.backendDOMNodeId !== undefined) {
        refCounter += 1;
        refEntry = {
          ref: `e${refCounter}`,
          backendNodeId: node.backendDOMNodeId,
          role,
          name,
          nth: undefined,
        };
        refs.set(refEntry.ref, refEntry);
      }

      const inlineProps: string[] = [];
      for (const property of node.properties ?? []) {
        if (INLINE_PROPERTIES.has(property.name.toLowerCase()) && property.value.value !== undefined) {
          inlineProps.push(`${property.name}=${formatPropertyValue(property.value.value)}`);
        }
      }
      const value = asString(node.value);

      items.push({
        depth: interactiveOnly ? 0 : depth,
        role,
        name,
        refEntry,
        inlineProps,
        value: value === '' ? undefined : value,
      });
    }

    const childDepth = rendered && !interactiveOnly ? depth + 1 : depth;
    for (const childId of node.childIds ?? []) {
      visit(childId, childDepth, true, rendered ? name : parentName);
    }
  };

  if (root) {
    visit(root.nodeId, 0, scopeBackendNodeIds === undefined, '');
  }

  // Disambiguate duplicate role+name pairs with a 1-based nth index.
  const duplicateGroups = new Map<string, RefEntry[]>();
  for (const entry of refs.values()) {
    const key = `${entry.role}|${entry.name}`;
    const group = duplicateGroups.get(key);
    if (group) {
      group.push(entry);
    } else {
      duplicateGroups.set(key, [entry]);
    }
  }
  for (const group of duplicateGroups.values()) {
    if (group.length > 1) {
      group.forEach((entry, index) => {
        entry.nth = index + 1;
      });
    }
  }

  const lines: string[] = [];
  lines.push(title === '' ? `Page: ${url}` : `Page: ${title} — ${url}`);
  lines.push('');
  for (const item of items) {
    const segments: string[] = [];
    if (item.refEntry) {
      segments.push(`@${item.refEntry.ref}`);
    }
    segments.push(`[${item.role}]`);
    if (item.name !== '') {
      segments.push(JSON.stringify(item.name));
    }
    if (item.refEntry?.nth !== undefined) {
      segments.push(`[${item.refEntry.nth}]`);
    }
    if (item.value !== undefined) {
      segments.push(`value=${JSON.stringify(item.value)}`);
    }
    segments.push(...item.inlineProps);
    lines.push(`${'  '.repeat(item.depth)}${segments.join(' ')}`);
  }

  return { text: lines.join('\n'), refs, refCount: refs.size };
}
