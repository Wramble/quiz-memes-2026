const fs = require('node:fs/promises');
const path = require('node:path');

function assertInside(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error('Path is outside allowed directory');
  return candidate;
}

async function listMedia(rootDir) {
  const mediaDir = path.join(rootDir, 'media');
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      if (entry.isFile()) files.push(path.relative(rootDir, entryPath).split(path.sep).join('/'));
    }
  }
  await visit(mediaDir);
  return files.sort((a, b) => a.localeCompare(b));
}

function backupName(date) {
  return `index.html.bak-${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

async function writeDocumentWithBackup(rootDir, html, clock = () => new Date()) {
  const documentPath = assertInside(rootDir, path.join(rootDir, 'index.html'));
  const backupPath = assertInside(rootDir, path.join(rootDir, backupName(clock())));
  const temporaryPath = assertInside(rootDir, path.join(rootDir, `.index.html.${process.pid}.tmp`));
  await fs.copyFile(documentPath, backupPath);
  await fs.writeFile(temporaryPath, html, 'utf8');
  await fs.rename(temporaryPath, documentPath);
  return backupPath;
}

module.exports = { assertInside, listMedia, writeDocumentWithBackup };
