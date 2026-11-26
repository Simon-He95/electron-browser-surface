import { spawnSync } from 'node:child_process';

const registry = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';
const otp = process.env.NPM_OTP;
const publishArgs = ['publish', '--access', 'public', `--registry=${registry}`];
if (otp) publishArgs.push(`--otp=${otp}`);

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run('pnpm', ['build']);
run('npm', publishArgs);
