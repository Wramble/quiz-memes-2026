const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  assertInside,
  listMedia,
  writeDocumentWithBackup,
} = require("./lib/file-store.js");

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024)
        reject(new Error("Request body exceeds 2 MiB"));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function createEditorServer({ rootDir }) {
  const clients = new Set();
  const watcher = fsSync.watch(
    path.join(__dirname, "public"),
    { recursive: true },
    () => {
      for (const client of clients)
        client.write("event: reload\ndata: now\n\n");
    },
  );
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/api/live-reload") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        response.write(": connected\n\n");
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }
      if (request.method === "GET" && request.url === "/api/document")
        return sendJson(response, 200, {
          html: await fs.readFile(path.join(rootDir, "index.html"), "utf8"),
        });
      if (request.method === "GET" && request.url === "/api/media")
        return sendJson(response, 200, { files: await listMedia(rootDir) });
      if (request.method === "PUT" && request.url === "/api/document") {
        const payload = JSON.parse(await readBody(request));
        if (typeof payload.html !== "string")
          return sendJson(response, 400, { error: "html must be a string" });
        const backup = await writeDocumentWithBackup(rootDir, payload.html);
        return sendJson(response, 200, { backup: path.basename(backup) });
      }
      if (
        request.method === "GET" &&
        (request.url === "/" || request.url === "/editor/")
      ) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return response.end(
          await fs.readFile(path.join(__dirname, "public", "index.html")),
        );
      }
      if (request.method === "GET" && request.url === "/editor/editor.js") {
        response.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
        });
        return response.end(
          await fs.readFile(path.join(__dirname, "public", "editor.js")),
        );
      }
      if (request.method === "GET" && request.url === "/editor/editor.css") {
        response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
        return response.end(
          await fs.readFile(path.join(__dirname, "public", "editor.css")),
        );
      }
      if (request.method === "GET" && /^\/(media|dist)\//.test(request.url)) {
        const relative = decodeURIComponent(request.url.slice(1).split("?")[0]);
        const filePath = assertInside(rootDir, path.join(rootDir, relative));
        response.writeHead(200, {
          "content-type": relative.endsWith(".css")
            ? "text/css; charset=utf-8"
            : relative.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : "application/octet-stream",
        });
        return response.end(await fs.readFile(filePath));
      }
      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  });
  server.on("close", () => watcher.close());
  return server;
}

if (require.main === module) {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = Number(portArg?.slice(7) || 8091);
  createEditorServer({ rootDir: path.resolve(__dirname, "..") }).listen(
    port,
    "127.0.0.1",
    () => console.log(`Quiz editor API: http://127.0.0.1:${port}`),
  );
}

module.exports = { createEditorServer };
