import test from 'node:test';
import assert from 'node:assert/strict';
import { observePage } from '../src/content/observe.js';
import { collectLocalValues } from '../src/privacy/collect.js';
import { detectSensitiveFields, countSensitive } from '../src/privacy/detect.js';

function fixture() {
  delete globalThis.__edgeSightFields;
  const definitions = [['employeeName', 'text', 'Employee Name', 'name'], ['email', 'email', 'Email', 'email'], ['phone', 'tel', 'Phone', 'tel'], ['employeeId', 'text', 'Employee ID', ''], ['destination', 'text', 'Destination', ''], ['purpose', 'select', 'Purpose', ''], ['password', 'password', 'Password', 'current-password']];
  const fields = definitions.map(([id, type, label, autocomplete], i) => ({
    id, name: id, tagName: type === 'select' ? 'SELECT' : 'INPUT', type, isConnected: true,
    label, style: { display: 'block', visibility: 'visible', opacity: '1' },
    rect: { left: 10, top: i * 50 + 10, right: 210, bottom: i * 50 + 50, width: 200, height: 40 },
    getBoundingClientRect() { return this.rect; },
    getAttribute(attr) { return ({ type, autocomplete })[attr] || ''; },
    closest() { return null; },
    get value() { throw new Error('Observer must not read values'); },
  }));
  globalThis.window = { innerWidth: 1000, innerHeight: 700, devicePixelRatio: 2, scrollX: 0, scrollY: 0 };
  globalThis.getComputedStyle = (el) => el.style;
  globalThis.CSS = { escape: (s) => s };
  globalThis.document = {
    title: 'Employee Travel Request',
    querySelectorAll(selector) { return selector === 'input, select, textarea' ? fields : selector === 'label' ? fields : [fields[0]]; },
    querySelector(selector) { return { textContent: fields.find((f) => selector.includes('"' + f.id + '"')).label }; },
  };
  return fields;
}
test('Phase 1 observation regression: counts, viewport, dimensions; Phase 2 remains value-free', () => {
  fixture();
  const result = observePage();
  assert.deepEqual(result.counts, { inputs: 7, buttons: 1, labels: 7 });
  assert.deepEqual(result.viewport, { width: 1000, height: 700 });
  assert.equal(result.devicePixelRatio, 2);
  assert.equal(countSensitive(detectSensitiveFields(result.fieldSignals)), 5);
  assert.ok(result.fieldSignals.every((f) => !('value' in f)));
  assert.deepEqual(result.fieldSignals[0].rect, { x: 10, y: 10, width: 200, height: 40 });
});
test('field IDs remain stable when DOM ordering changes', () => {
  const fields = fixture();
  const before = observePage().fieldSignals;
  fields.reverse();
  const after = observePage().fieldSignals;
  for (const field of before) assert.equal(after.find((f) => f.elementId === field.elementId).id, field.id);
});
test('only viewport-visible fields participate', () => {
  const fields = fixture();
  fields[0].style.display = 'none';
  fields[1].style.visibility = 'hidden';
  fields[2].style.opacity = '0';
  fields[3].rect = { left: 1200, right: 1400, top: 0, bottom: 40, width: 200, height: 40 };
  fields[4].rect.width = 0;
  assert.equal(observePage().fieldSignals.length, 2);
});
test('separate local collector returns temporary values and clears element references', () => {
  const fields = fixture();
  for (const field of fields) Object.defineProperty(field, 'value', { value: 'synthetic-test-only' });
  const observation = observePage();
  const collected = collectLocalValues(observation.fieldSignals.map((f) => f.id), ['field_1']);
  assert.equal(collected.length, 7);
  assert.equal(globalThis.__edgeSightFields.elements.size, 0);
  assert.throws(() => collectLocalValues(['missing'], []));
});
test('known sensitive values repeated in page text block without returning text or values', () => {
  const fields = fixture();
  for (const field of fields) Object.defineProperty(field, 'value', { value: 'synthetic-test-only' });
  document.body = { innerText: 'Label contains synthetic-test-only' };
  const observation = observePage();
  assert.throws(() => collectLocalValues(observation.fieldSignals.map((f) => f.id), ['field_1']),
    (error) => error.message === 'Sensitive data outside field regions.');
  assert.equal(globalThis.__edgeSightFields.elements.size, 0);
});
test('clickable controls carry their visible label locally; fields never read a value for it', () => {
  fixture();
  const button = { tagName: 'BUTTON', innerText: '  Go\n on ', getAttribute: () => '', closest: () => null,
    style: { display: 'block', visibility: 'visible', opacity: '1' },
    getBoundingClientRect: () => ({ left: 10, top: 400, right: 110, bottom: 430, width: 100, height: 30 }) };
  const all = document.querySelectorAll;
  document.querySelectorAll = (selector) => selector.startsWith('button') ? [button] : selector === 'a[href]' ? [] : all(selector);
  const controls = observePage().controls;
  assert.equal(controls.find((c) => c.role === 'button').label, 'Go on');
  assert.ok(controls.filter((c) => c.role !== 'button').every((c) => c.label === ''));
});
