import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';

import webpackConfig from '../webpack.local-app.config.js';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = path.join(projectRoot, 'dist');
const buildDir = path.join(projectRoot, '.local-build');
const releaseDir = path.join(projectRoot, 'release', `${process.platform}-${process.arch}`);
const outputName = process.platform === 'win32' ? 'openalex-gui-plus.exe' : 'openalex-gui-plus';
const outputPath = path.join(releaseDir, outputName);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

function ensureCompatibleNode() {
  const helpResult = spawnSync(process.execPath, ['--help'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  const helpText = `${helpResult.stdout || ''}\n${helpResult.stderr || ''}`;

  if (!helpText.includes('--build-sea')) {
    fail(
      `Node ${process.versions.node} does not support "--build-sea". Use a newer Node release (for example "nvm use 25") before running "npm run package:local".`,
    );
  }
}

async function ensureDistBuild() {
  try {
    await fs.access(path.join(distDir, 'index.html'));
  } catch (error) {
    fail('Missing dist/index.html. Run "npm run build" before packaging the local app.');
  }
}

async function buildSeaBundle() {
  log('Bundling local app server for SEA...');

  await new Promise((resolve, reject) => {
    webpack(webpackConfig, (error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      if (stats?.hasErrors()) {
        reject(new Error(stats.toString({ colors: false, all: false, errors: true, warnings: true })));
        return;
      }

      resolve();
    });
  });
}

async function listFiles(dir, rootDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath, rootDir));
      continue;
    }
    files.push(path.relative(rootDir, fullPath));
  }

  return files.sort();
}

async function writeSeaConfig() {
  await fs.mkdir(releaseDir, { recursive: true });

  const distFiles = await listFiles(distDir);
  const assets = Object.fromEntries(
    distFiles.map((relativePath) => [
      `frontend/${relativePath.replace(/\\/g, '/')}`,
      path.join(distDir, relativePath),
    ]),
  );

  const config = {
    main: path.join(buildDir, 'sea-main.cjs'),
    output: outputPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets,
  };

  const configPath = path.join(buildDir, 'sea-config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function buildSingleExecutable(configPath) {
  log('Building single executable local app...');

  const result = spawnSync(process.execPath, ['--build-sea', configPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(`SEA build failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function signExecutableIfNeeded() {
  if (process.platform !== 'darwin') return;

  log('Applying ad-hoc code signature for macOS...');
  const result = spawnSync('codesign', ['--sign', '-', outputPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(
      `codesign failed with exit code ${result.status ?? 'unknown'}. The generated macOS executable may be killed immediately if it is not signed.`,
    );
  }
}

async function writeLauncherReadme() {
  const readmePath = path.join(releaseDir, 'README-local-app.txt');
  const lines = [
    'OpenAlex GUI Plus local app',
    '',
    `1. Run ${outputName}`,
    '2. Wait for the terminal to print the local URL',
    '3. Open http://127.0.0.1:18400 in your browser',
    '',
    'The application runs entirely on the local computer and can talk to the local Zotero desktop connector.',
  ];
  await fs.writeFile(readmePath, lines.join('\n'));
}

async function main() {
  ensureCompatibleNode();
  await ensureDistBuild();
  await buildSeaBundle();
  const configPath = await writeSeaConfig();
  buildSingleExecutable(configPath);
  signExecutableIfNeeded();
  await writeLauncherReadme();

  log('');
  log(`Local executable created at: ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
