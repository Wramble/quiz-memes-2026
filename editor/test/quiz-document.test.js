const assert = require('node:assert/strict');
const test = require('node:test');

const {
  markerStatus,
  parseQuizDocument,
  renderQuizDocument
} = require('../lib/quiz-document.js');

const fixtureHtml = `<!doctype html>
<!-- quiz-editor:title:start -->
<h2>Мемология</h2>
<!-- quiz-editor:title:end -->
<!-- quiz-editor:round-list:start -->
<h3>1. Разминка</h3>
<!-- quiz-editor:round-list:end -->
<!-- quiz-editor:rounds:start -->
<!-- quiz-editor:round id="warmup" name="Разминка":start -->
<section><section>Question</section><section id="custom-score-video">Answer</section></section>
<!-- quiz-editor:round:end -->
<!-- quiz-editor:rounds:end -->
<section id="unmarked-footer">Keep me</section>`;

test('parses owned regions and retains custom round HTML', () => {
  const document = parseQuizDocument(fixtureHtml);

  assert.equal(document.model.titleHtml, '<h2>Мемология</h2>');
  assert.equal(document.model.rounds[0].id, 'warmup');
  assert.match(document.model.rounds[0].html, /custom-score-video/);
});

test('renders only owned ranges', () => {
  const document = parseQuizDocument(fixtureHtml);
  const result = renderQuizDocument(document, {
    ...document.model,
    titleHtml: '<h2>Новая тема</h2>'
  });

  assert.match(result, /<section id="unmarked-footer">Keep me<\/section>/);
  assert.match(result, /<h2>Новая тема<\/h2>/);
});

test('reports missing marker regions without guessing', () => {
  assert.deepEqual(markerStatus('<html></html>'), {
    title: false,
    roundList: false,
    rounds: false
  });
  assert.throws(() => parseQuizDocument('<html></html>'), /title/);
});
