import { describe, expect, it } from 'vitest';
import { buildSnapshot, classifyRole, type AXNodeData } from '../src/snapshot';

const nodes: AXNodeData[] = [
  { nodeId: 'root', role: { value: 'RootWebArea' }, name: { value: 'Demo' }, childIds: ['text', 'button'] },
  { nodeId: 'text', parentId: 'root', role: { value: 'StaticText' }, name: { value: 'Hello' }, backendDOMNodeId: 10 },
  { nodeId: 'button', parentId: 'root', role: { value: 'button' }, name: { value: 'Go' }, backendDOMNodeId: 11 },
];

describe('accessibility snapshot', () => {
  it('renders stable refs for interactive and named content nodes', () => {
    const result = buildSnapshot({ nodes, url: 'https://example.test', title: 'Demo' });
    expect(result.text).toContain('Page: Demo — https://example.test');
    expect(result.text).toContain('@e1 [statictext] "Hello"');
    expect(result.text).toContain('@e2 [button] "Go"');
    expect(result.refs.get('e2')).toMatchObject({ backendNodeId: 11, role: 'button' });
  });

  it('supports selector scope and interactive-only views', () => {
    const result = buildSnapshot({
      nodes,
      url: 'https://example.test',
      title: 'Demo',
      scopeBackendNodeIds: new Set([11]),
      interactiveOnly: true,
    });
    expect(result.text).toContain('[button] "Go"');
    expect(result.text).not.toContain('Hello');
  });

  it('classifies roles into interactive/content/structural', () => {
    expect(classifyRole('button')).toBe('INTERACTIVE');
    expect(classifyRole('heading')).toBe('CONTENT');
    expect(classifyRole('generic')).toBe('STRUCTURAL');
  });
});
