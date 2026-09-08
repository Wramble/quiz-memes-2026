const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const {
  findAudioFiles,
  optimizeAudios,
  parseArgs
} = require('./optimize-audio.js');

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

test('findAudioFiles finds nested audio files and ignores generated outputs', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-audio-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const nestedDir = path.join(rootDir, 'nested');
  await fs.mkdir(nestedDir);
  await fs.writeFile(path.join(nestedDir, 'voice.wav'), 'not a real audio file');
  await fs.writeFile(path.join(nestedDir, 'voice.optimized.mp3'), 'generated output');
  await fs.writeFile(path.join(rootDir, 'notes.txt'), 'ignore me');

  const files = await findAudioFiles(rootDir);

  assert.deepEqual(files.map((filePath) => path.relative(rootDir, filePath)), [
    path.join('nested', 'voice.wav')
  ]);
});

test('parseArgs accepts a custom bitrate', () => {
  assert.equal(parseArgs(['--bitrate=192k']).options.bitrate, '192k');
});

test('optimizeAudios creates an MP3 and keeps the original', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-audio-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const inputPath = path.join(rootDir, 'source.wav');
  await runProcess('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=1',
    '-c:a',
    'pcm_s16le',
    '-y',
    inputPath
  ]);

  const result = await optimizeAudios(rootDir, { bitrate: '128k' });

  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  await assert.doesNotReject(() => fs.access(inputPath));

  const outputPath = path.join(rootDir, 'source.optimized.mp3');
  const probe = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name,bit_rate',
    '-of',
    'json',
    outputPath
  ]);
  const stream = JSON.parse(probe.stdout).streams[0];

  assert.equal(stream.codec_name, 'mp3');
  assert.ok(Number(stream.bit_rate) <= 140000);
});

test('optimizeAudios skips audio that is already below the target bitrate', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimize-audio-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  const inputPath = path.join(rootDir, 'small.mp3');
  await runProcess('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '64k',
    '-y',
    inputPath
  ]);

  const result = await optimizeAudios(rootDir, { bitrate: '128k' });

  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
  await assert.rejects(() => fs.access(path.join(rootDir, 'small.optimized.mp3')));
});
