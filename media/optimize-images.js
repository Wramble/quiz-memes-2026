const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
  '.bmp'
]);

const DEFAULT_QUALITY = 82;
const DEFAULT_EFFORT = 5;

function isSupportedImage(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function findImageFiles(rootDir) {
  const imageFiles = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((first, second) => first.name.localeCompare(second.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && isSupportedImage(entryPath)) {
        imageFiles.push(entryPath);
      }
    }
  }

  await visit(rootDir);
  return imageFiles;
}

function validateOptions({ quality, effort }) {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new RangeError('quality must be an integer from 1 to 100');
  }

  if (!Number.isInteger(effort) || effort < 0 || effort > 6) {
    throw new RangeError('effort must be an integer from 0 to 6');
  }
}

async function optimizeImage(inputPath, options = {}) {
  const quality = options.quality ?? DEFAULT_QUALITY;
  const effort = options.effort ?? DEFAULT_EFFORT;
  validateOptions({ quality, effort });

  const outputPath = path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.webp`
  );

  await sharp(inputPath)
    .webp({ quality, effort })
    .toFile(outputPath);

  return outputPath;
}

async function optimizeImages(rootDir, options = {}) {
  const imageFiles = await findImageFiles(rootDir);
  const result = { processed: 0, failed: 0, errors: [] };

  for (const imagePath of imageFiles) {
    try {
      await optimizeImage(imagePath, options);
      result.processed += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ path: imagePath, error });
    }
  }

  return result;
}

function parseArgs(args) {
  const options = {
    quality: DEFAULT_QUALITY,
    effort: DEFAULT_EFFORT
  };
  let rootDir = __dirname;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg.startsWith('--quality=')) {
      options.quality = Number(arg.slice('--quality='.length));
    } else if (arg.startsWith('--effort=')) {
      options.effort = Number(arg.slice('--effort='.length));
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (rootDir === __dirname) {
      rootDir = path.resolve(arg);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  validateOptions(options);
  return { rootDir, options };
}

function printHelp() {
  console.log('Usage: node media/optimize-images.js [directory] [options]');
  console.log('');
  console.log('Options:');
  console.log(`  --quality=82  WebP quality from 1 to 100 (default: ${DEFAULT_QUALITY})`);
  console.log(`  --effort=5    WebP compression effort from 0 to 6 (default: ${DEFAULT_EFFORT})`);
}

async function main(args) {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    return;
  }

  const result = await optimizeImages(parsed.rootDir, parsed.options);
  console.log(`Processed: ${result.processed}`);

  if (result.failed > 0) {
    console.error(`Failed: ${result.failed}`);
    for (const failure of result.errors) {
      console.error(`- ${failure.path}: ${failure.error.message}`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  findImageFiles,
  isSupportedImage,
  optimizeImage,
  optimizeImages,
  parseArgs
};
