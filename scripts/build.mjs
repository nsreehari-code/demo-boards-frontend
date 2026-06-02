#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const viteRoot = resolve(here, '..');
const args = process.argv.slice(2);
const refreshYamlFlowCdnVersion = args.includes('--refresh-yaml-flow-cdn-version');
const refreshOnly = args.includes('--refresh-only');
const outDirArgIndex = args.indexOf('--out-dir');
const outDirName = outDirArgIndex >= 0 && typeof args[outDirArgIndex + 1] === 'string' && args[outDirArgIndex + 1].trim()
  ? args[outDirArgIndex + 1].trim()
  : 'dist';
const outDir = resolve(viteRoot, outDirName);
const appConfigPath = resolve(viteRoot, 'app-config.json');
const packageJsonPath = resolve(viteRoot, 'package.json');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmVersionArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', npmCommand, 'view', 'yaml-flow', 'version']
  : ['view', 'yaml-flow', 'version'];

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

async function maybeRefreshYamlFlowCdnVersion() {
  if (!refreshYamlFlowCdnVersion) return;

  const packageJsonRaw = await readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonRaw);
  const currentVersion = String(packageJson.yamlFlowCdnVersion || '').trim();
  const npmView = spawnSync(process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : npmCommand, npmVersionArgs, {
    cwd: viteRoot,
    encoding: 'utf8',
    shell: false,
  });

  if (npmView.status !== 0) {
    console.error('\n[build] failed to resolve latest yaml-flow version from npm');
    if (npmView.error) {
      console.error(`[build] ${npmView.error.message}`);
    }
    if (npmView.stderr) {
      console.error(String(npmView.stderr).trim());
    }
    process.exit(npmView.status ?? 1);
  }

  const latestVersion = String(npmView.stdout || '').trim();
  if (!latestVersion) {
    console.error('\n[build] npm returned an empty yaml-flow version');
    process.exit(1);
  }

  if (latestVersion !== currentVersion) {
    packageJson.yamlFlowCdnVersion = latestVersion;
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.log(`[build] updated yamlFlowCdnVersion: ${currentVersion || '(empty)'} -> ${latestVersion}`);
  } else {
    console.log(`[build] yamlFlowCdnVersion already current at ${latestVersion}`);
  }
}

await maybeRefreshYamlFlowCdnVersion();

if (refreshOnly) {
  process.exit(0);
}

await validateAppConfig();

run(process.execPath, [resolve(viteRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDirName], { cwd: viteRoot });
await mkdir(outDir, { recursive: true });
await copyFile(appConfigPath, resolve(outDir, 'app-config.json'));
await writeFile(resolve(outDir, '.nojekyll'), '');