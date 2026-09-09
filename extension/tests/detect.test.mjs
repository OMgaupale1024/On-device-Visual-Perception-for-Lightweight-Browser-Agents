// Phase 2 tests for local sensitive-field detection.
// Run: node extension/tests/detect.test.mjs
// No framework — plain node:assert. Detection is pure, so this needs no browser.
import assert from 'node:assert/strict';
import { classifyField, detectSensitiveFields, countSensitive } from '../src/privacy/detect.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS  ' + name); };

// Demo-representative signals (structural only — the signal shape has NO value field).
const demoSignals = [
  { id: 'field_1', type: 'text',     name: 'employeeName', elementId: 'employeeName', label: 'Employee Name', autocomplete: 'name' },
  { id: 'field_2', type: 'email',    name: 'email',        elementId: 'email',        label: 'Email',         autocomplete: 'email' },
  { id: 'field_3', type: 'tel',      name: 'phone',        elementId: 'phone',        label: 'Phone',         autocomplete: 'tel' },
  { id: 'field_4', type: 'text',     name: 'employeeId',   elementId: 'employeeId',   label: 'Employee ID',   autocomplete: '' },
  { id: 'field_5', type: 'text',     name: 'destination',  elementId: 'destination',  label: 'Destination',   autocomplete: '' },
  { id: 'field_6', type: 'select',   name: 'purpose',      elementId: 'purpose',      label: 'Purpose',       autocomplete: '' },
  { id: 'field_7', type: 'password', name: 'password',     elementId: 'password',     label: 'Password',      autocomplete: 'current-password' },
];

test('demo roles are classified correctly', () => {
  const roles = Object.fromEntries(detectSensitiveFields(demoSignals).map((f) => [f.id, f.role]));
  assert.equal(roles.field_1, 'name');
  assert.equal(roles.field_2, 'email');
  assert.equal(roles.field_3, 'phone');
  assert.equal(roles.field_4, 'employee_id');
  assert.equal(roles.field_5, 'other');       // destination
  assert.equal(roles.field_6, 'other');       // purpose
  assert.equal(roles.field_7, 'password');
});

test('sensitive total on the demo form is exactly 5', () => {
  const fields = detectSensitiveFields(demoSignals);
  assert.equal(countSensitive(fields), 5);
  const sensitiveRoles = fields.filter((f) => f.sensitive).map((f) => f.role).sort();
  assert.deepEqual(sensitiveRoles, ['email', 'employee_id', 'name', 'password', 'phone']);
});

test('false positives are NOT flagged sensitive (conservative)', () => {
  const fp = [
    { id: 'a', type: 'text', name: 'username',    elementId: 'username',    label: 'Username' },
    { id: 'b', type: 'text', name: 'nickname',    elementId: 'nickname',    label: 'Nickname' },
    { id: 'c', type: 'text', name: 'filename',    elementId: 'filename',    label: 'File name' },
    { id: 'd', type: 'text', name: 'screenName',  elementId: 'screenName',  label: 'Screen name' },
    { id: 'e', type: 'text', name: 'destination', elementId: 'destination', label: 'Destination' },
    { id: 'f', type: 'text', name: 'purpose',     elementId: 'purpose',     label: 'Purpose' },
    { id: 'g', type: 'text', name: 'company',     elementId: 'company',     label: 'Company' },
    { id: 'h', type: 'text', name: 'q',           elementId: 'q',           label: 'Search' },
  ];
  for (const s of fp) assert.equal(classifyField(s), 'other', 'should be other: ' + s.label);
});

test('real name variants ARE detected (no under-matching)', () => {
  assert.equal(classifyField({ label: 'Full Name', name: '', elementId: '' }), 'name');
  assert.equal(classifyField({ label: 'First Name', name: 'firstName' }), 'name');
  assert.equal(classifyField({ label: 'Name', name: 'name' }), 'name');
  assert.equal(classifyField({ name: '', label: '', autocomplete: 'given-name' }), 'name');
});

test('classification ignores field values (no value sniffing)', () => {
  // A neutral field whose *value* looks like PII must stay "other" — we classify signals, not values.
  const s = { id: 'x', type: 'text', name: 'q', elementId: 'q', label: 'Query',
              value: 'rahul@example.com 9876543210 secret123' };
  assert.equal(classifyField(s), 'other');
});

test('returned metadata never contains raw field values (serialization/leak proof)', () => {
  const rawValues = ['Rahul Sharma', 'rahul@example.com', '9876543210', 'EMP1024', 'secret123', 'Bengaluru', 'Conference'];
  // Worst case: signals accidentally carry values. Prove the detector never copies them out.
  const tainted = demoSignals.map((s, i) => ({ ...s, value: rawValues[i] }));
  const fields = detectSensitiveFields(tainted);
  const json = JSON.stringify(fields);
  for (const v of rawValues) {
    assert.ok(!json.includes(v), 'raw value leaked into metadata: ' + v);
  }
  // Output objects expose ONLY the intended, non-value keys.
  for (const f of fields) {
    assert.deepEqual(Object.keys(f).sort(), ['id', 'label', 'role', 'sensitive']);
  }
});

test('empty / missing input is handled', () => {
  assert.deepEqual(detectSensitiveFields(undefined), []);
  assert.deepEqual(detectSensitiveFields([]), []);
  assert.equal(classifyField({}), 'other');
});

console.log('\nAll ' + passed + ' tests passed.');
