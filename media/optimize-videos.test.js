const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const {
  findVideoFiles,
  getEncoderCandidates,
  optimizeVideos,
  parseArgs
} = require('./optimize-videos.js');

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
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
  });
}

test('findVideoFiles finds nested videos and ignores generated outputs', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-videos-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const nestedDir = path.join(rootDir, 'nested');
  await fs.mkdir(nestedDir);
  await fs.writeFile(path.join(nestedDir, 'clip.mov'), 'not a real video');
  await fs.writeFile(path.join(nestedDir, 'clip.optimized.mp4'), 'generated output');
  await fs.writeFile(path.join(rootDir, 'notes.txt'), 'ignore me');

  const files = await findVideoFiles(rootDir);

  assert.deepEqual(files.map((filePath) => path.relative(rootDir, filePath)), [
    path.join('nested', 'clip.mov')
  ]);
});

test('supports automatic GPU encoder selection with CPU fallback', () => {
  assert.deepEqual(getEncoderCandidates('auto'), [
    'h264_nvenc',
    'h264_qsv',
    'h264_amf',
    'libx264'
  ]);
  assert.equal(parseArgs(['--encoder=nvenc']).options.encoder, 'nvenc');
});

test('optimizeVideos creates a 720p-or-smaller MP4 and keeps the original', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-videos-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const inputPath = path.join(rootDir, 'source.mp4');
  await runProcess('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=1920x1080:rate=1',
    '-t',
    '1',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-y',
    inputPath
  ]);

  const result = await optimizeVideos(rootDir, { encoder: 'cpu' });

  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  await assert.doesNotReject(() => fs.access(inputPath));

  const outputPath = path.join(rootDir, 'source.optimized.mp4');
  const probe = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,codec_name',
    '-of',
    'json',
    outputPath
  ]);
  const stream = JSON.parse(probe.stdout).streams[0];

  assert.equal(stream.codec_name, 'h264');
  assert.equal(stream.width, 1280);
  assert.equal(stream.height, 720);
});

test('optimizeVideos skips videos that are already 720p or smaller', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-videos-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const inputPath = path.join(rootDir, 'small.mp4');
  await runProcess('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=1',
    '-t',
    '1',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-y',
    inputPath
  ]);

  const result = await optimizeVideos(rootDir, { encoder: 'cpu' });

  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
  await assert.rejects(() => fs.access(path.join(rootDir, 'small.optimized.mp4')));
});
