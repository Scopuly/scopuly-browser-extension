import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assetRoot = path.join(root, 'docs', 'store-assets');
const expectedAssets = new Map([
  ['scopuly-store-onboarding-1280x800.png', [1280, 800]],
  ['scopuly-store-pairing-1280x800.png', [1280, 800]],
  ['scopuly-store-dashboard-1280x800.png', [1280, 800]],
  ['scopuly-store-account-access-1280x800.png', [1280, 800]],
  ['scopuly-store-mobile-waiting-1280x800.png', [1280, 800]],
  ['scopuly-store-success-1280x800.png', [1280, 800]],
  ['scopuly-store-rejection-1280x800.png', [1280, 800]],
  ['scopuly-promo-440x280.png', [440, 280]],
  ['scopuly-marquee-1400x560.png', [1400, 560]]
]);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hashes = new Set();

for (const [filename, [expectedWidth, expectedHeight]] of expectedAssets) {
  const filePath = path.join(assetRoot, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing store asset: ${filename}`);
  }

  const image = fs.readFileSync(filePath);
  if (image.length < 32 || !image.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`Store asset is not a valid PNG: ${filename}`);
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `${filename} has ${width}x${height}; expected ${expectedWidth}x${expectedHeight}.`
    );
  }

  const hash = crypto.createHash('sha256').update(image).digest('hex');
  if (hashes.has(hash)) {
    throw new Error(`Store asset duplicates another required image: ${filename}`);
  }
  hashes.add(hash);
}

console.log(`Store assets look good (${expectedAssets.size} unique PNG files).`);
