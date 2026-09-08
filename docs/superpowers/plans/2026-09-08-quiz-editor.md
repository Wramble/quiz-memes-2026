# Quiz Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local editor that assembles the custom Reveal.js quiz while retaining a full-document code editor for exceptional markup.

**Architecture:** A dependency-free Node HTTP server owns file-system access and serves a vanilla-JS editor. Pure CommonJS modules parse and render only the marked `index.html` regions; the browser edits a structured model, individual section HTML, or full source.

**Tech Stack:** Node.js 18+, CommonJS, `node:http`, `node:test`, browser ES modules, existing Reveal.js assets.

**Spec:** `docs/superpowers/specs/2026-09-08-quiz-editor-design.md`

## Global Constraints

- Keep existing Reveal.js scripts, CSS, global configuration, and unmarked HTML unchanged.
- Bind the editor server to localhost; read/write only `index.html` and list only existing files below `media/`.
- Do not upload, optimize, rename, move, delete, or overwrite media.
- Create `index.html.bak-<timestamp>` before every successful document write.
- Accept arbitrary per-section HTML and attributes; structured controls must not restrict source editing.
- Preserve the user’s existing uncommitted `index.html` edits except for the approved marker migration.

---

### Task 1: Marker parser, document model, and renderer

**Files:**

- Create: `editor/lib/quiz-document.js`
- Create: `editor/test/quiz-document.test.js`
- Modify: `index.html:73,76-87,98-1078`

**Interfaces:**

- Produces `parseQuizDocument(html)`, `renderQuizDocument(document, model)`, `createRound(input)`, and `markerStatus(html)`.
- `parseQuizDocument` returns `{ html, model }`; model is `{ titleHtml, roundListHtml, rounds }`, and a round is `{ id, name, html, defaults, slots }`.

- [ ] **Step 1: Write failing marker and preservation tests**

```js
test('parses owned regions and retains custom round HTML', () => {
  const document = parseQuizDocument(fixtureHtml);
  assert.equal(document.model.titleHtml, '<h2>Мемология</h2>');
  assert.match(document.model.rounds[0].html, /custom-score-video/);
});

test('renders only owned ranges', () => {
  const result = renderQuizDocument(parseQuizDocument(fixtureHtml), changedModel);
  assert.match(result, /<section id="unmarked-footer">Keep me<\/section>/);
  assert.match(result, /<h2>Новая тема<\/h2>/);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test editor/test/quiz-document.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact marker replacement**

```js
function markerStatus(html) {
  return {
    title: /<!-- quiz-editor:title:start -->[\s\S]*<!-- quiz-editor:title:end -->/.test(html),
    roundList: /<!-- quiz-editor:round-list:start -->[\s\S]*<!-- quiz-editor:round-list:end -->/.test(html),
    rounds: /<!-- quiz-editor:rounds:start -->[\s\S]*<!-- quiz-editor:rounds:end -->/.test(html)
  };
}
```

Use exact start/end marker matching, throw a named error for a missing owned range, and preserve all bytes outside owned ranges. Parse a round only between its `quiz-editor:round` comments; never infer ownership from arbitrary Reveal sections.

- [ ] **Step 4: Migrate approved markers into the current quiz**

Wrap the current `<h2>` quiz title, round-list items, and all current round containers with the approved marker form. Give every current round a unique stable ASCII ID. Preserve the original content, indentation, attributes, scripts, styles, and media paths.

- [ ] **Step 5: Verify parser and migration**

Run: `node --test editor/test/quiz-document.test.js; git diff --check -- index.html editor/lib/quiz-document.js editor/test/quiz-document.test.js`

Expected: tests pass and diff check emits no whitespace error.

- [ ] **Step 6: Commit the self-contained task**

Run: `git add index.html editor/lib/quiz-document.js editor/test/quiz-document.test.js && git commit -m "feat: add quiz document markers and parser"`

### Task 2: Defaults, slots, templates, and attributes

**Files:**

- Create: `editor/lib/quiz-model.js`
- Create: `editor/templates.js`
- Create: `editor/test/quiz-model.test.js`

**Interfaces:**

- Produces `createEmptySlots(questionCount)`, `effectiveAttributes(defaults, overrides)`, `setSlotTemplate(slot, template, options)`, `serializeAttributes(attributes)`, and `parseSectionAttributes(sectionHtml)`.
- A template is `{ id, kind, label, html }`, where kind is `question` or `answer`.

- [ ] **Step 1: Write failing inheritance and template tests**

```js
test('merges round defaults with slide overrides', () => {
  assert.deepEqual(effectiveAttributes(
    { 'data-autoslide': '40000', 'start-audio': true, volumehalf: true },
    { 'data-autoslide': '30000', 'stop-audio': true }
  ), { 'data-autoslide': '30000', 'start-audio': true, 'stop-audio': true, volumehalf: true });
});

test('creates blank question and answer slots', () => {
  assert.deepEqual(createEmptySlots(2).map(({ kind, number }) => [kind, number]), [
    ['question', 1], ['answer', 1], ['question', 2], ['answer', 2]
  ]);
});

test('does not replace non-empty HTML without explicit opt-in', () => {
  assert.throws(() => setSlotTemplate({ kind: 'answer', html: '<section>Keep</section>' }, answerTemplate, { replace: false }));
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test editor/test/quiz-model.test.js`

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement pure model utilities and templates**

```js
function createEmptySlots(questionCount) {
  return Array.from({ length: questionCount }, (_, index) => [
    { kind: 'question', number: index + 1, html: '', overrides: {} },
    { kind: 'answer', number: index + 1, html: '', overrides: {} }
  ]).flat();
}

function effectiveAttributes(defaults, overrides) {
  return { ...defaults, ...overrides };
}
```

Extract representative question and answer markup from the current quiz. Add neutral text, image, video, audio, timer-question, and answer/reveal templates with complete `<section>` HTML and placeholder text. Support standard Reveal attributes and arbitrary boolean/name-value attributes.

- [ ] **Step 4: Verify the model layer**

Run: `node --test editor/test/quiz-model.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the self-contained task**

Run: `git add editor/lib/quiz-model.js editor/templates.js editor/test/quiz-model.test.js && git commit -m "feat: add quiz round defaults and templates"`

### Task 3: Local-only HTTP API and atomic persistence

**Files:**

- Create: `editor/server.js`
- Create: `editor/lib/file-store.js`
- Create: `editor/test/server.test.js`
- Modify: `package.json:8-14`

**Interfaces:**

- Produces `createEditorServer({ rootDir })`.
- Endpoints are `GET /api/document`, `GET /api/media`, and `PUT /api/document` with `{ html: string }`.
- `file-store.js` exports `listMedia(rootDir)`, `assertInside(rootDir, candidatePath)`, and `writeDocumentWithBackup(rootDir, html, clock)`.

- [ ] **Step 1: Write failing API, traversal, and backup tests**

```js
test('GET /api/media returns sorted project-relative media paths', async () => {
  const response = await request(server, '/api/media');
  assert.deepEqual(response.json.files, ['media/a.webp', 'media/nested/b.mp3']);
});

test('writeDocumentWithBackup saves a backup first', async () => {
  await writeDocumentWithBackup(rootDir, '<html>new</html>', () => new Date('2026-09-08T12:00:00Z'));
  assert.equal(await fs.readFile(path.join(rootDir, 'index.html.bak-20260908T120000Z'), 'utf8'), '<html>old</html>');
});

test('assertInside rejects traversal above media root', () => {
  assert.throws(() => assertInside(mediaDir, path.join(mediaDir, '..', 'index.html')));
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test editor/test/server.test.js`

Expected: FAIL because the server and store modules do not exist.

- [ ] **Step 3: Implement the server and guarded store**

```js
const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/document') return sendJson(response, 200, { html: await readDocument(rootDir) });
  if (request.method === 'GET' && request.url === '/api/media') return sendJson(response, 200, { files: await listMedia(rootDir) });
  if (request.method === 'PUT' && request.url === '/api/document') return writeDocumentRoute(request, response, rootDir);
  return serveEditorAsset(request, response, rootDir);
});
```

Bind to `127.0.0.1` by default and support `--port`. Limit request bodies to 2 MiB; require a JSON string field named `html`; resolve and check every filesystem candidate path; write to a same-directory temporary file then rename. Add `"editor": "node editor/server.js"` to package scripts.

- [ ] **Step 4: Verify API and command help**

Run: `node --test editor/test/server.test.js; npm run editor -- --help`

Expected: PASS; help states localhost URL, port option, and that media is never mutated.

- [ ] **Step 5: Commit the self-contained task**

Run: `git add package.json editor/server.js editor/lib/file-store.js editor/test/server.test.js && git commit -m "feat: add local quiz editor server"`

### Task 4: Editor shell and full-document source view

**Files:**

- Create: `editor/public/index.html`
- Create: `editor/public/editor.css`
- Create: `editor/public/editor.js`
- Create: `editor/public/source-view.js`
- Create: `editor/test/source-view.test.js`

**Interfaces:**

- Consumes API endpoints from Task 3 and `markerStatus` from Task 1.
- Produces `loadDocument()`, `saveDocument(html)`, `setSourceText(state, html)`, and `getSourceMarkerWarning(html)`.

- [ ] **Step 1: Write failing source-state tests**

```js
test('warns but allows source saving after marker removal', () => {
  assert.match(getSourceMarkerWarning('<html></html>'), /structured editing/);
});

test('keeps whole source as the in-memory document', () => {
  assert.equal(setSourceText(initialState, '<html>custom</html>').sourceHtml, '<html>custom</html>');
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test editor/test/source-view.test.js`

Expected: FAIL because source-view does not exist.

- [ ] **Step 3: Implement navigation and source mode**

```html
<nav>
  <button data-view="quiz">Квиз</button>
  <button data-view="slide">Слайд</button>
  <button data-view="source">Исходник</button>
  <button id="save-document">Сохранить</button>
</nav>
<main id="editor-view" aria-live="polite"></main>
```

Use a `<textarea>` for full source, avoiding a new editor dependency. Fetch document and media on load. Source save must show marker availability but never block intentionally markerless HTML; visible errors retain unsaved source. Do not auto-save.

- [ ] **Step 4: Verify shell modules**

Run: `node --test editor/test/source-view.test.js; node --check editor/public/editor.js; node --check editor/public/source-view.js`

Expected: PASS with no syntax errors.

- [ ] **Step 5: Commit the self-contained task**

Run: `git add editor/public/index.html editor/public/editor.css editor/public/editor.js editor/public/source-view.js editor/test/source-view.test.js && git commit -m "feat: add quiz editor source view"`

### Task 5: Structured quiz and slide editing

**Files:**

- Create: `editor/public/quiz-view.js`
- Create: `editor/public/slide-view.js`
- Create: `editor/public/attributes-view.js`
- Create: `editor/test/attributes-view.test.js`
- Modify: `editor/public/editor.js`

**Interfaces:**

- Consumes the in-memory model, templates, model utilities, and the API media list.
- Produces `renderQuizView(state)`, `renderSlideView(state, selection)`, `readAttributes(formData)`, and `applyMediaPath(sectionHtml, tagName, mediaPath)`.

- [ ] **Step 1: Write failing attribute and media tests**

```js
test('retains a custom boolean attribute', () => {
  const form = new FormData([['name', 'data-autoslide-auto'], ['boolean', 'true']]);
  assert.deepEqual(readAttributes(form), { 'data-autoslide-auto': true });
});

test('inserts selected media in the active tag', () => {
  assert.match(applyMediaPath('<section><img></section>', 'img', 'media/warmup/1.webp'), /src="media\/warmup\/1.webp"/);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test editor/test/attributes-view.test.js`

Expected: FAIL because structured view modules do not exist.

- [ ] **Step 3: Add quiz and round controls**

Render title and ordered rounds; creation asks for name, question count, answer time, audio start/stop, volume setting, and Reveal defaults. An explicit action appends exactly the configured empty question and answer slots. It must not choose templates or alter populated slots.

- [ ] **Step 4: Add slide, template, media, and attribute controls**

Show question and answer templates separately. Require confirmation before replacing non-empty HTML. Provide a filterable list of API-returned media paths; a selection only updates active section HTML. Provide controls for `data-autoslide`, `data-autoslide-auto`, `data-auto-animate`, `data-transition`, `q-num`, `start-audio`, `stop-audio`, `volumehalf`, `volumefull`, plus arbitrary boolean/name-value attributes. Keep raw section HTML visible alongside every structured control.

- [ ] **Step 5: Verify structured controls**

Run: `node --test editor/test/attributes-view.test.js; node --check editor/public/quiz-view.js; node --check editor/public/slide-view.js; node --check editor/public/attributes-view.js`

Expected: PASS with no syntax errors.

- [ ] **Step 6: Commit the self-contained task**

Run: `git add editor/public/editor.js editor/public/quiz-view.js editor/public/slide-view.js editor/public/attributes-view.js editor/test/attributes-view.test.js && git commit -m "feat: add structured quiz and slide editing"`

### Task 6: Integration verification and user documentation

**Files:**

- Create: `editor/README.md`
- Create: `editor/test/integration.test.js`
- Modify: `package.json:8-15`
- Modify: `README.md:after Getting started section`

**Interfaces:**

- Consumes all editor modules and current `index.html`.
- Produces documented `npm run editor` and `npm run test:editor` workflows.

- [ ] **Step 1: Write a real-document integration test**

```js
test('current quiz parses, creates blank slots, renders, and parses again', async () => {
  const html = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf8');
  const document = parseQuizDocument(html);
  const round = createRound({ id: 'test-round', name: 'Тест', questionCount: 2, defaults: { 'data-autoslide': '40000' } });
  const rebuilt = renderQuizDocument(document, { ...document.model, rounds: [...document.model.rounds, round] });
  assert.equal(parseQuizDocument(rebuilt).model.rounds.at(-1).slots.length, 4);
});
```

- [ ] **Step 2: Run the test before integration exports exist**

Run: `node --test editor/test/integration.test.js`

Expected: FAIL until all parser, renderer, and model exports are connected.

- [ ] **Step 3: Add the final scripts and documentation**

Add `"test:editor": "node --test editor/test/*.test.js"`. Document localhost-only operation, loading a quiz, all three views, media selection, backups, marker warnings, and backup restoration. Describe that full source mode can intentionally make a structured region unavailable.

- [ ] **Step 4: Run targeted automated verification**

Run: `npm run test:editor; git diff --check; git status --short`

Expected: editor tests pass; no whitespace error; no media modifications. Do not require full `npm test`: this repository has previously recorded unrelated Reveal browser-test failures, which must be reported separately if still present.

- [ ] **Step 5: Perform the manual end-to-end check**

Run `npm run editor -- --port 8091`; open `http://127.0.0.1:8091/editor/`; load the current quiz; create a round and blank slots; choose question and answer templates; select existing media; alter a slide timer/audio override; save; reload the editor; then run `npm start` and open the produced quiz. Restore the automatic backup after this manual save so the committed quiz contains only the approved marker migration.

- [ ] **Step 6: Commit the self-contained task**

Run: `git add package.json README.md editor/README.md editor/test/integration.test.js && git commit -m "docs: document quiz editor workflow"`
