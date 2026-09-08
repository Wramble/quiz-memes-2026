const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.wma'
]);

const DEFAULT_BITRATE = '128k';

function normalizeBitrate(bitrate) {
  const normalized = String(bitrate).trim().toLowerCase();
  const match = normalized.match(/^(\d+)k$/);

  if (!match || Number(match[1]) < 32 || Number(match[1]) > 320) {
    throw new RangeError('bitrate must be between 32k and 320k');
  }

  return normalized;
}

function bitrateToNumber(bitrate) {
  return Number.parseInt(bitrate, 10) * 1000;
}

function isAudioFile(filePath) {
  const fileName = path.basename(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(path.extname(fileName)) && !fileName.endsWith('.optimized.mp3');
}

async function findAudioFiles(rootDir) {
  const audioFiles = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((first, second) => first.name.localeCompare(second.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && isAudioFile(entryPath)) {
        audioFiles.push(entryPath);
      }
    }
  }

  await visit(rootDir);
  return audioFiles;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('ffmpeg не найден в PATH. Установите ffmpeg и повторите запуск.'));
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function getAudioBitrate(inputPath) {
  const result = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=bit_rate:format=bit_rate',
    '-of',
    'json',
    inputPath
  ]);
  const metadata = JSON.parse(result.stdout || '{}');
  const value = metadata.streams?.[0]?.bit_rate ?? metadata.format?.bit_rate;
  const bitrate = Number(value);

  return Number.isFinite(bitrate) ? bitrate : null;
}

function getOutputPath(inputPath) {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  return path.join(path.dirname(inputPath), `${baseName}.optimized.mp3`);
}

async function optimizeAudio(inputPath, options = {}) {
  const bitrate = normalizeBitrate(options.bitrate ?? DEFAULT_BITRATE);
  const outputPath = getOutputPath(inputPath);
  const sourceBitrate = await getAudioBitrate(inputPath);

  if (sourceBitrate !== null && sourceBitrate <= bitrateToNumber(bitrate)) {
    return { outputPath, skipped: true, reason: 'bitrate-is-already-low-enough' };
  }

  const temporaryOutputPath = `${outputPath}.tmp-${process.pid}-${Date.now()}.mp3`;

  try {
    await runProcess('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-map',
      '0:a:0',
      '-vn',
      '-c:a',
      'libmp3lame',
      '-b:a',
      bitrate,
      '-map_metadata',
      '0',
      '-id3v2_version',
      '3',
      '-y',
      temporaryOutputPath
    ]);

    const [sourceStats, temporaryStats] = await Promise.all([
      fs.stat(inputPath),
      fs.stat(temporaryOutputPath)
    ]);

    if (temporaryStats.size >= sourceStats.size) {
      return { outputPath, skipped: true, reason: 'output-is-not-smaller' };
    }

    await fs.rm(outputPath, { force: true });
    await fs.rename(temporaryOutputPath, outputPath);
  } finally {
    await fs.rm(temporaryOutputPath, { force: true });
  }

  return { outputPath, skipped: false };
}

async function optimizeAudios(rootDir, options = {}) {
  const audioFiles = await findAudioFiles(rootDir);
  const result = { processed: 0, skipped: 0, failed: 0, errors: [] };

  for (const audioPath of audioFiles) {
    try {
      const outcome = await optimizeAudio(audioPath, options);
      result[outcome.skipped ? 'skipped' : 'processed'] += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ path: audioPath, error });
    }
  }

  return result;
}

function parseArgs(args) {
  const options = { bitrate: DEFAULT_BITRATE };
  let rootDir = __dirname;
  let rootDirProvided = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg.startsWith('--bitrate=')) {
      options.bitrate = normalizeBitrate(arg.slice('--bitrate='.length));
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!rootDirProvided) {
      rootDir = path.resolve(arg);
      rootDirProvided = true;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  options.bitrate = normalizeBitrate(options.bitrate);
  return { rootDir, options };
}

function printHelp() {
  console.log('Usage: node media/optimize-audio.js [directory] [options]');
  console.log('');
  console.log('Creates .optimized.mp3 files and keeps the original audio files.');
  console.log('');
  console.log('Options:');
  console.log(`  --bitrate=128k  MP3 bitrate from 32k to 320k (default: ${DEFAULT_BITRATE})`);
}

async function main(args) {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    return;
  }

  const result = await optimizeAudios(parsed.rootDir, parsed.options);
  console.log(`Processed: ${result.processed}`);
  console.log(`Skipped: ${result.skipped}`);

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
  findAudioFiles,
  getAudioBitrate,
  getOutputPath,
  isAudioFile,
  normalizeBitrate,
  optimizeAudio,
  optimizeAudios,
  parseArgs
};
