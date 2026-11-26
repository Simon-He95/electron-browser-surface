import { spawnSync } from 'node:child_process';

const registry = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';
const input = process.argv.slice(2);
const release = input[0] && !input[0].startsWith('-') ? input.shift() : undefined;

// Build and publish before bumpp commits/tags/pushes, so a failed publish
// leaves no remote tag behind.
const execute = `pnpm build && npm publish --access public --registry=${registry}`;
const args = ['exec', 'bumpp', '--git-check', '--execute', execute];
if (release) args.push('--release', release);
args.push(...input);

const result = spawnSync('pnpm', args, { stdio: 'inherit' });
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
