const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v'
]);

const DEFAULT_CRF = 28;
const DEFAULT_PRESET = 'medium';
const DEFAULT_ENCODER = 'auto';
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow'
]);
const ENCODER_CANDIDATES = {
  auto: ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'],
  cpu: ['libx264'],
  nvenc: ['h264_nvenc'],
  qsv: ['h264_qsv'],
  amf: ['h264_amf']
};
const NVENC_PRESETS = {
  ultrafast: 'p1',
  superfast: 'p2',
  veryfast: 'p3',
  faster: 'p4',
  fast: 'p4',
  medium: 'p5',
  slow: 'p6',
  slower: 'p7',
  veryslow: 'p7'
};

function isVideoFile(filePath) {
  const fileName = path.basename(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(path.extname(fileName)) && !fileName.endsWith('.optimized.mp4');
}

async function findVideoFiles(rootDir) {
  const videoFiles = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((first, second) => first.name.localeCompare(second.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && isVideoFile(entryPath)) {
        videoFiles.push(entryPath);
      }
    }
  }

  await visit(rootDir);
  return videoFiles;
}

function validateOptions({ crf, preset, encoder }) {
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
    throw new RangeError('crf must be an integer from 0 to 51');
  }

  if (!PRESETS.has(preset)) {
    throw new RangeError(`preset must be one of: ${[...PRESETS].join(', ')}`);
  }

  if (!Object.hasOwn(ENCODER_CANDIDATES, encoder)) {
    throw new RangeError(`encoder must be one of: ${Object.keys(ENCODER_CANDIDATES).join(', ')}`);
  }
}

function getEncoderCandidates(encoder) {
  if (!Object.hasOwn(ENCODER_CANDIDATES, encoder)) {
    throw new RangeError(`encoder must be one of: ${Object.keys(ENCODER_CANDIDATES).join(', ')}`);
  }

  return [...ENCODER_CANDIDATES[encoder]];
}

function getVideoEncoderArgs(encoder, { crf, preset }) {
  if (encoder === 'libx264') {
    return ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf)];
  }

  if (encoder === 'h264_nvenc') {
    return [
      '-c:v',
      'h264_nvenc',
      '-preset',
      NVENC_PRESETS[preset],
      '-rc',
      'vbr',
      '-cq',
      String(crf),
      '-b:v',
      '0'
    ];
  }

  if (encoder === 'h264_qsv') {
    return ['-c:v', 'h264_qsv', '-preset', preset, '-global_quality', String(crf)];
  }

  if (encoder === 'h264_amf') {
    return [
      '-c:v',
      'h264_amf',
      '-quality',
      'balanced',
      '-rc',
      'cqp',
      '-qp_i',
      String(crf),
      '-qp_p',
      String(crf)
    ];
  }

  throw new Error(`Unsupported video encoder: ${encoder}`);
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';

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
        resolve({ stdout: '', stderr });
      } else {
        reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function getVideoHeight(inputPath) {
  const result = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=height',
    '-of',
    'json',
    inputPath
  ]);
  const metadata = JSON.parse(result.stdout || '{}');
  const height = Number(metadata.streams?.[0]?.height);

  return Number.isFinite(height) ? height : null;
}

function getOutputPath(inputPath) {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  return path.join(path.dirname(inputPath), `${baseName}.optimized.mp4`);
}

async function optimizeVideo(inputPath, options = {}) {
  const crf = options.crf ?? DEFAULT_CRF;
  const preset = options.preset ?? DEFAULT_PRESET;
  const encoder = options.encoder ?? DEFAULT_ENCODER;
  validateOptions({ crf, preset, encoder });

  const outputPath = getOutputPath(inputPath);
  const sourceHeight = await getVideoHeight(inputPath);

  if (sourceHeight !== null && sourceHeight <= MAX_HEIGHT) {
    return { outputPath, skipped: true, reason: 'height-is-already-within-limit' };
  }

  const temporaryOutputPath = `${outputPath}.tmp-${process.pid}-${Date.now()}.mp4`;
  let lastError;

  try {
    for (const encoderName of getEncoderCandidates(encoder)) {
      try {
        await runProcess('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          inputPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-vf',
          `scale=${MAX_WIDTH}:${MAX_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
          ...getVideoEncoderArgs(encoderName, { crf, preset }),
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          '-map_metadata',
          '0',
          '-y',
          temporaryOutputPath
        ]);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await fs.rm(temporaryOutputPath, { force: true });
      }
    }

    if (lastError) {
      throw lastError;
    }

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

async function optimizeVideos(rootDir, options = {}) {
  const videoFiles = await findVideoFiles(rootDir);
  const result = { processed: 0, skipped: 0, failed: 0, errors: [] };

  for (const videoPath of videoFiles) {
    try {
      const outcome = await optimizeVideo(videoPath, options);
      result[outcome.skipped ? 'skipped' : 'processed'] += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ path: videoPath, error });
    }
  }

  return result;
}

function parseArgs(args) {
  const options = {
    crf: DEFAULT_CRF,
    preset: DEFAULT_PRESET,
    encoder: DEFAULT_ENCODER
  };
  let rootDir = __dirname;
  let rootDirProvided = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg.startsWith('--crf=')) {
      options.crf = Number(arg.slice('--crf='.length));
    } else if (arg.startsWith('--preset=')) {
      options.preset = arg.slice('--preset='.length);
    } else if (arg.startsWith('--encoder=')) {
      options.encoder = arg.slice('--encoder='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!rootDirProvided) {
      rootDir = path.resolve(arg);
      rootDirProvided = true;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  validateOptions(options);
  return { rootDir, options };
}

function printHelp() {
  console.log('Usage: node media/optimize-videos.js [directory] [options]');
  console.log('');
  console.log('Creates .optimized.mp4 files and keeps the original videos.');
  console.log('Maximum output resolution: 1280x720.');
  console.log('');
  console.log('Options:');
  console.log(`  --crf=28       H.264 quality/compression value (default: ${DEFAULT_CRF})`);
  console.log(`  --preset=medium Encoding speed/compression preset (default: ${DEFAULT_PRESET})`);
  console.log('  --encoder=auto  auto, cpu, nvenc, qsv or amf (default: auto)');
}

async function main(args) {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    return;
  }

  const result = await optimizeVideos(parsed.rootDir, parsed.options);
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
  findVideoFiles,
  getEncoderCandidates,
  getVideoHeight,
  getOutputPath,
  isVideoFile,
  optimizeVideo,
  optimizeVideos,
  parseArgs
};
