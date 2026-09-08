const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createEmptySlots,
  effectiveAttributes,
  serializeAttributes,
  setSlotTemplate
} = require('../lib/quiz-model.js');

test('creates ordered empty question and answer slots', () => {
  assert.deepEqual(createEmptySlots(2).map(({ kind, number }) => [kind, number]), [
    ['question', 1], ['answer', 1], ['question', 2], ['answer', 2]
  ]);
});

test('overrides a round default for an individual slide', () => {
  assert.deepEqual(effectiveAttributes(
    { 'data-autoslide': '40000', 'start-audio': true, volumehalf: true },
    { 'data-autoslide': '30000', 'stop-audio': true }
  ), { 'data-autoslide': '30000', 'start-audio': true, volumehalf: true, 'stop-audio': true });
});

test('keeps arbitrary boolean and value attributes', () => {
  assert.equal(serializeAttributes({ 'data-auto-animate': true, 'data-transition': 'fade-in' }), ' data-auto-animate data-transition="fade-in"');
});

test('requires replacement permission for populated template slots', () => {
  const slot = { kind: 'answer', html: '<section>Keep</section>' };
  assert.throws(() => setSlotTemplate(slot, { kind: 'answer', html: '<section>New</section>' }, { replace: false }));
});
