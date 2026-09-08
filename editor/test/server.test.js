const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createEditorServer } = require("../server.js");

function request(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: pathname,
        headers: body ? { "content-type": "application/json" } : {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: data,
            json:
              res.headers["content-type"]?.includes("application/json") && data
                ? JSON.parse(data)
                : null,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

test("serves document and sorted media through local API", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-server-"));
  await fs.mkdir(path.join(root, "media"), { recursive: true });
  await fs.writeFile(path.join(root, "index.html"), "<html>quiz</html>");
  await fs.writeFile(path.join(root, "media", "b.webp"), "");
  await fs.writeFile(path.join(root, "media", "a.mp3"), "");
  const server = createEditorServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const port = server.address().port;
  assert.equal(
    (await request(port, "GET", "/api/document")).json.html,
    "<html>quiz</html>",
  );
  assert.deepEqual((await request(port, "GET", "/api/media")).json.files, [
    "media/a.mp3",
    "media/b.webp",
  ]);
});

test("serves the editor page", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-server-"));
  await fs.writeFile(path.join(root, "index.html"), "<html>quiz</html>");
  await fs.mkdir(path.join(root, "media"));
  const server = createEditorServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const response = await request(server.address().port, "GET", "/");
  assert.equal(response.status, 200);
  assert.match(response.body, /Редактор квиза/);
});

test("opens an event stream for editor live reload", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-server-"));
  await fs.writeFile(path.join(root, "index.html"), "<html>quiz</html>");
  await fs.mkdir(path.join(root, "media"));
  const server = createEditorServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const response = await new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path: "/api/live-reload",
      },
      resolve,
    );
    request.on("error", reject);
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/event-stream/);
  response.destroy();
});

test("serves editor stylesheet", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-server-"));
  await fs.writeFile(path.join(root, "index.html"), "<html>quiz</html>");
  await fs.mkdir(path.join(root, "media"));
  const server = createEditorServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const response = await request(
    server.address().port,
    "GET",
    "/editor/editor.css",
  );
  assert.equal(response.status, 200);
  assert.match(response.body, /--surface/);
});

test("serves a media file below the project media directory", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-server-"));
  await fs.writeFile(path.join(root, "index.html"), "<html>quiz</html>");
  await fs.mkdir(path.join(root, "media"));
  await fs.writeFile(path.join(root, "media", "picture.webp"), "image");
  const server = createEditorServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const response = await request(
    server.address().port,
    "GET",
    "/media/picture.webp",
  );
  assert.equal(response.status, 200);
  assert.equal(response.body, "image");
});

test("serves Reveal plugins used by the quiz document", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-server-"));
  await fs.writeFile(path.join(root, "index.html"), "<html>quiz</html>");
  await fs.mkdir(path.join(root, "media"));
  await fs.mkdir(path.join(root, "plugin", "highlight"), { recursive: true });
  await fs.writeFile(
    path.join(root, "plugin", "highlight", "highlight.js"),
    "window.RevealHighlight = {};",
  );
  const server = createEditorServer({ rootDir: root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const response = await request(
    server.address().port,
    "GET",
    "/plugin/highlight/highlight.js",
  );
  assert.equal(response.status, 200);
  assert.equal(response.body, "window.RevealHighlight = {};");
});
