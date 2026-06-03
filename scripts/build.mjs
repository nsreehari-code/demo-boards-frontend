#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const viteRoot = resolve(here, '..');
const args = process.argv.slice(2);
const outDirArgIndex = args.indexOf('--out-dir');
const outDirName = outDirArgIndex >= 0 && typeof args[outDirArgIndex + 1] === 'string' && args[outDirArgIndex + 1].trim()
  ? args[outDirArgIndex + 1].trim()
  : 'dist';
const outDir = resolve(viteRoot, outDirName);
const appConfigPath = resolve(viteRoot, 'app-config.json');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (result.status !== 0) {
    console.error(`\n[build] command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

async function validateAppConfig() {
  const raw = await readFile(appConfigPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('app-config.json must contain an object');
  }
}

await validateAppConfig();

run(process.execPath, [resolve(viteRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDirName], { cwd: viteRoot });
await mkdir(outDir, { recursive: true });
await copyFile(appConfigPath, resolve(outDir, 'app-config.json'));
await writeFile(resolve(outDir, '.nojekyll'), '');