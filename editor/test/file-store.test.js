const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { listMedia, writeDocumentWithBackup } = require("../lib/file-store.js");

test("lists only sorted project-relative media files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "media", "nested"), { recursive: true });
  await fs.writeFile(path.join(root, "media", "z.webp"), "");
  await fs.writeFile(path.join(root, "media", "nested", "a.mp3"), "");
  assert.deepEqual(await listMedia(root), [
    "media/nested/a.mp3",
    "media/z.webp",
  ]);
});

test("backs up index before replacement", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quiz-editor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "index.html"), "old");
  await writeDocumentWithBackup(
    root,
    "new",
    () => new Date("2026-09-08T12:00:00Z"),
  );
  assert.equal(
    await fs.readFile(
      path.join(root, "index.html.bak-20260908T120000Z"),
      "utf8",
    ),
    "old",
  );
  assert.equal(await fs.readFile(path.join(root, "index.html"), "utf8"), "new");
});
