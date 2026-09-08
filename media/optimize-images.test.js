const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

sharp.cache(false);

const { findImageFiles, optimizeImages } = require('./optimize-images.js');

async function createFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-images-'));
  const nestedDir = path.join(rootDir, 'nested', 'deep');
  await fs.mkdir(nestedDir, { recursive: true });

  await sharp({
    create: {
      width: 4,
      height: 3,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).png().toFile(path.join(rootDir, 'cover.png'));

  await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 0, g: 128, b: 255 }
    }
  }).jpeg().toFile(path.join(nestedDir, 'card.jpg'));

  await fs.writeFile(path.join(rootDir, 'notes.txt'), 'ignore me');
  await fs.writeFile(path.join(rootDir, 'animation.gif'), 'ignore animations');

  return rootDir;
}

test('findImageFiles finds supported images in nested folders and ignores other files', async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const files = await findImageFiles(rootDir);

  assert.deepEqual(files.map((filePath) => path.relative(rootDir, filePath)), [
    'cover.png',
    path.join('nested', 'deep', 'card.jpg')
  ]);
});

test('optimizeImages creates WebP files and keeps originals', async (t) => {
  const rootDir = await createFixture();
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const result = await optimizeImages(rootDir, { quality: 80, effort: 4 });

  assert.equal(result.processed, 2);
  assert.equal(result.failed, 0);
  await assert.doesNotReject(() => fs.access(path.join(rootDir, 'cover.png')));
  await assert.doesNotReject(() => fs.access(path.join(rootDir, 'cover.webp')));
  await assert.doesNotReject(() => fs.access(path.join(rootDir, 'nested', 'deep', 'card.webp')));

  const metadata = await sharp(path.join(rootDir, 'nested', 'deep', 'card.webp')).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 2);
});
