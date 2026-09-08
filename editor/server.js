const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { listMedia, writeDocumentWithBackup } = require('./lib/file-store.js');

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 2 * 1024 * 1024) reject(new Error('Request body exceeds 2 MiB')); });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function createEditorServer({ rootDir }) {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/api/document') return sendJson(response, 200, { html: await fs.readFile(path.join(rootDir, 'index.html'), 'utf8') });
      if (request.method === 'GET' && request.url === '/api/media') return sendJson(response, 200, { files: await listMedia(rootDir) });
      if (request.method === 'PUT' && request.url === '/api/document') {
        const payload = JSON.parse(await readBody(request));
        if (typeof payload.html !== 'string') return sendJson(response, 400, { error: 'html must be a string' });
        const backup = await writeDocumentWithBackup(rootDir, payload.html);
        return sendJson(response, 200, { backup: path.basename(backup) });
      }
      return sendJson(response, 404, { error: 'Not found' });
    } catch (error) { return sendJson(response, 400, { error: error.message }); }
  });
}

if (require.main === module) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='));
  const port = Number(portArg?.slice(7) || 8091);
  createEditorServer({ rootDir: path.resolve(__dirname, '..') }).listen(port, '127.0.0.1', () => console.log(`Quiz editor API: http://127.0.0.1:${port}`));
}

module.exports = { createEditorServer };
