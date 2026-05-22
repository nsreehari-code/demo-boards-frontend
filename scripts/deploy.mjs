#!/usr/bin/env node
// Build the Vite app into docs/, then commit and push from this repo.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const viteRoot = resolve(here, '..');
const docsDir = resolve(viteRoot, 'docs');
const noGit = process.argv.includes('--no-git');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`\n[deploy] command failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

console.log('[deploy] building vite app...');
run(process.execPath, [resolve(viteRoot, 'scripts', 'build.mjs'), '--out-dir', 'docs'], { cwd: viteRoot });

writeFileSync(resolve(docsDir, '.nojekyll'), '');

if (noGit) {
  console.log('[deploy] --no-git set; skipping git commit/push');
  process.exit(0);
}

const status = spawnSync('git', ['-C', viteRoot, 'status', '--porcelain', 'docs'], { encoding: 'utf8' });
if (!status.stdout.trim()) {
  console.log('[deploy] no changes in docs/; nothing to commit');
  process.exit(0);
}

console.log('[deploy] committing & pushing docs/');
run('git', ['-C', viteRoot, 'add', 'docs']);
const msg = `deploy: refresh docs/ ${new Date().toISOString()}`;
run('git', ['-C', viteRoot, 'commit', '-m', msg]);
run('git', ['-C', viteRoot, 'push', 'origin', 'HEAD']);
console.log('[deploy] done. configure Pages for this repo as needed.');
