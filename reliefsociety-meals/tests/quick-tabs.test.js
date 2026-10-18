'use strict';
/**
 * The "Quick Add" and "Quick Cancel" tabs on a person's private
 * responses sheet, handled by onResponsesEdit(): sign-ups taken by
 * phone, and dates someone had to back out of.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, person, submit, typeRow } = require('./fixtures');
const { GREEN } = require('./apps-script-fakes');

const RANGE = { startDate: '2026-11-02', endDate: '2026-11-04' };

test('Quick Add: claims the date, marks Done, and adds the person to the roster', () => {
  const ctx = load();
  const p = person(ctx, RANGE);

  const tab = typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '555-0101', '', '2026-11-03']);

  assert.strictEqual(tab.getRange(2, 5).getValue(), 'Done');
  assert.strictEqual(p.square('2026-11-03'), '3\nSmith Family');
  assert.ok(!p.form.choices().includes(p.label('2026-11-03')));

  const roster = p.responses.getSheetByName('Form Responses 1');
  const [, name, phone, email, date] = roster.rowValues(2, 5);
  assert.deepStrictEqual([name, phone, email, date], ['Smith Family', '555-0101', '', p.label('2026-11-03')]);
});

test('Quick Add: emails a confirmation when an address is given', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '', 'smith@example.test', '2026-11-03']);
  assert.strictEqual(ctx.$.sentMail.length, 1);
  assert.strictEqual(ctx.$.sentMail[0].to, 'smith@example.test');
});

test('Quick Add: does nothing until both a name and a date are filled in', () => {
  const ctx = load();
  const p = person(ctx, RANGE);

  const tab = typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '', '', '']);
  assert.strictEqual(tab.getRange(2, 5).getValue(), '');

  typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '', '', '2026-11-03']);
  assert.strictEqual(tab.getRange(2, 5).getValue(), 'Done');
});

test('Quick Add: explains a date it can\'t match', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const tab = typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '', '', '11/3/2026']);
  assert.match(tab.getRange(2, 5).getValue(), /Could not match "11\/3\/2026" — use yyyy-mm-dd/);
  assert.strictEqual(p.form.choices().length, 3);
});

test('Quick Add: a date already taken gets an error in Status and no roster row', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  submit(ctx, p.form, { name: 'First Family', date: p.label('2026-11-03') });

  const tab = typeRow(ctx, p.responses, 'Quick Add', 2, ['Second Family', '', '', '2026-11-03']);

  assert.match(tab.getRange(2, 5).getValue(), /not an open date/);
  assert.strictEqual(p.square('2026-11-03'), '3\nFirst Family');
  assert.strictEqual(p.responses.getSheetByName('Form Responses 1').getLastRow(), 1, 'only the header row');
});

test('Quick Add: editing a row marked Done again does not claim it twice', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '', '', '2026-11-03']);

  typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '555-0199', '', '2026-11-03', 'Done']);

  assert.strictEqual(p.responses.getSheetByName('Form Responses 1').getLastRow(), 2, 'still one roster row');
});

test('Quick Add: a pasted block of rows is handled row by row', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const tab = p.responses.getSheetByName('Quick Add');
  const range = tab.getRange(2, 1, 2, 4).setValues([
    ['A Family', '', '', '2026-11-02'],
    ['B Family', '', '', '2026-11-04']
  ]);

  ctx.onResponsesEdit({ range });

  assert.strictEqual(tab.getRange(2, 5).getValue(), 'Done');
  assert.strictEqual(tab.getRange(3, 5).getValue(), 'Done');
  assert.deepStrictEqual(p.form.choices(), [p.label('2026-11-03')]);
});

test('Quick Add: text that looks like a formula is stored as plain text', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  typeRow(ctx, p.responses, 'Quick Add', 2, ['=IMPORTXML("http://evil")', '+1 555 0101', '', '2026-11-03']);
  const [, name, phone] = p.responses.getSheetByName('Form Responses 1').rowValues(2, 3);
  assert.strictEqual(name, '\'=IMPORTXML("http://evil")');
  assert.strictEqual(phone, "'+1 555 0101");
});

test('Quick Cancel: reopens the date, clears the square and removes the roster row', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  typeRow(ctx, p.responses, 'Quick Add', 2, ['Smith Family', '', '', '2026-11-03']);

  const tab = typeRow(ctx, p.responses, 'Quick Cancel', 2, ['2026-11-03']);

  assert.strictEqual(tab.getRange(2, 2).getValue(), 'Reopened');
  assert.strictEqual(p.square('2026-11-03'), '3\n— available —');
  assert.strictEqual(p.squareColor('2026-11-03'), '#ffffff');
  assert.deepStrictEqual(p.form.choices(), [p.label('2026-11-02'), p.label('2026-11-03'), p.label('2026-11-04')],
    'back on the dropdown, in date order');
  assert.strictEqual(p.responses.getSheetByName('Form Responses 1').getLastRow(), 1, 'only the header row');
});

test('Quick Cancel: explains a date it can\'t match', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const tab = typeRow(ctx, p.responses, 'Quick Cancel', 2, ['2026-12-25']);
  assert.match(tab.getRange(2, 2).getValue(), /Could not match "2026-12-25"/);
});

test('edits anywhere else on the responses sheet are ignored', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  typeRow(ctx, p.responses, 'Form Responses 1', 2, ['', 'Smith Family', '', '', p.label('2026-11-03')]);
  assert.strictEqual(p.form.choices().length, 3);
  assert.deepStrictEqual(ctx.$.errors, []);
});

test('Quick tabs on a spreadsheet the script doesn\'t know about are ignored', () => {
  const ctx = load();
  person(ctx, RANGE);
  const other = ctx.SpreadsheetApp.create('Not ours');
  other.insertSheet('Quick Add');
  typeRow(ctx, other, 'Quick Add', 2, ['Smith Family', '', '', '2026-11-03']);
  assert.match(ctx.$.errors[0], /does not recognize/);
});
