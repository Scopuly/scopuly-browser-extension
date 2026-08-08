import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8')
);
const sourceArchive = path.join(
  root,
  'release',
  `scopuly-mobile-signer-source-v${manifest.version}.zip`
);
const expectedArchive = path.join(
  root,
  'release',
  `scopuly-mobile-signer-firefox-v${manifest.version}.zip`
);
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'scopuly-firefox-reproduction-')
);

function run(command, argumentsList, cwd, environment = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${argumentsList.join(' ')} failed with exit code ${result.status}.`
    );
  }
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

try {
  if (!fs.existsSync(sourceArchive)) {
    throw new Error(`Source release archive was not found: ${sourceArchive}`);
  }
  if (!fs.existsSync(expectedArchive)) {
    throw new Error(`Firefox release archive was not found: ${expectedArchive}`);
  }

  run('unzip', ['-q', sourceArchive, '-d', temporaryRoot], root);
  for (const required of ['package.json', 'package-lock.json', 'vite.config.ts']) {
    if (!fs.existsSync(path.join(temporaryRoot, required))) {
      throw new Error(`Extracted source archive is missing ${required}.`);
    }
  }

  run(
    'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    temporaryRoot
  );
  run('npm', ['test'], temporaryRoot);
  run(
    'npm',
    ['run', 'package:firefox'],
    temporaryRoot,
    {
      VITE_SCOPULY_BRIDGE_URL: 'https://api.scopuly.com/extension-bridge'
    }
  );

  const reproducedArchive = path.join(
    temporaryRoot,
    'release',
    `scopuly-mobile-signer-firefox-v${manifest.version}.zip`
  );
  const expectedHash = sha256(expectedArchive);
  const reproducedHash = sha256(reproducedArchive);
  if (reproducedHash !== expectedHash) {
    throw new Error(
      'Firefox source reproduction differs from the release archive: '
        + `expected ${expectedHash}, reproduced ${reproducedHash}.`
    );
  }

  console.log(
    `Firefox v${manifest.version} source reproduction passed: ${reproducedHash}.`
  );
} finally {
  if (temporaryRoot.startsWith(os.tmpdir())) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
