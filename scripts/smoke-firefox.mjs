import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import webExt from 'web-ext';

const root = process.cwd();
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8')
);
const archiveArgument = process.argv.find((argument) => (
  argument === '--archive' || argument.startsWith('--archive=')
));
const archivePath = archiveArgument && archiveArgument !== '--archive'
  ? path.resolve(root, archiveArgument.slice('--archive='.length))
  : path.join(
      root,
      'release',
      `scopuly-mobile-signer-firefox-v${sourceManifest.version}.zip`
    );
const firefoxCandidates = [
  process.env.SCOPULY_FIREFOX_PATH,
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
].filter(Boolean);
const firefoxPath = firefoxCandidates.find((candidate) => fs.existsSync(candidate));
const extensionPath = fs.mkdtempSync(
  path.join(os.tmpdir(), 'scopuly-firefox-package-')
);
let runner;

try {
  if (!firefoxPath) {
    throw new Error('Firefox was not found. Set SCOPULY_FIREFOX_PATH.');
  }
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Firefox release archive was not found: ${archivePath}`);
  }

  const extraction = spawnSync(
    'unzip',
    ['-q', archivePath, '-d', extensionPath],
    {encoding: 'utf8'}
  );
  if (extraction.status !== 0) {
    throw new Error(
      extraction.stderr || `Could not extract Firefox archive: ${archivePath}`
    );
  }

  const packagedManifest = JSON.parse(
    fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8')
  );
  if (packagedManifest.version !== sourceManifest.version
    || !Array.isArray(packagedManifest.background?.scripts)
    || packagedManifest.browser_specific_settings?.gecko?.strict_min_version !== '140.0'
    || packagedManifest.browser_specific_settings?.gecko_android?.strict_min_version !== '142.0') {
    throw new Error('The extracted Firefox archive has an unexpected manifest.');
  }

  const lintResult = await webExt.cmd.lint({
    sourceDir: extensionPath,
    warningsAsErrors: true,
    output: 'json',
    boring: true
  }, {
    shouldExitProgram: false
  });
  if (lintResult.summary.errors
    || lintResult.summary.warnings
    || lintResult.metadata?.id !== 'extension@scopuly.com') {
    throw new Error(`Firefox lint failed: ${JSON.stringify(lintResult.summary)}`);
  }

  runner = await webExt.cmd.run({
    sourceDir: extensionPath,
    firefox: firefoxPath,
    noInput: true,
    noReload: true,
    startUrl: ['about:blank']
  }, {
    shouldExitProgram: false
  });
  const reloadResults = await runner.reloadAllExtensions();
  const reloadFailure = reloadResults.find((result) => result.reloadError);
  if (reloadFailure) {
    throw reloadFailure.reloadError;
  }

  console.log(
    `Firefox exact-package smoke passed for Scopuly v${sourceManifest.version}.`
  );
} finally {
  if (runner) {
    const closed = new Promise((resolve) => runner.registerCleanup(resolve));
    await runner.exit();
    await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(resolve, 10_000))
    ]);
  }
  if (extensionPath.startsWith(os.tmpdir())) {
    fs.rmSync(extensionPath, {recursive: true, force: true});
  }
}
