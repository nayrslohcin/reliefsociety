'use strict';
/**
 * The small pure functions everything else is built on: date lists,
 * date parsing, name keys, cell sanitizing, the .ics escaping.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, plain } = require('./fixtures');

test('buildDateList: every day in the range, as dropdown labels', () => {
  const ctx = load();
  assert.deepStrictEqual(plain(ctx.buildDateList('2026-11-02', '2026-11-04', [])), [
    'Monday, November 2, 2026',
    'Tuesday, November 3, 2026',
    'Wednesday, November 4, 2026'
  ]);
});

test('buildDateList: a single day when start and end match', () => {
  const ctx = load();
  assert.deepStrictEqual(plain(ctx.buildDateList('2026-11-05', '2026-11-05', [])),
    ['Thursday, November 5, 2026']);
});

test('buildDateList: leaves out single excluded dates and excluded ranges', () => {
  const ctx = load();
  const dates = plain(ctx.buildDateList('2026-11-02', '2026-11-08',
    ['2026-11-03', ['2026-11-05', '2026-11-07']]));
  assert.deepStrictEqual(dates, [
    'Monday, November 2, 2026',
    'Wednesday, November 4, 2026',
    'Sunday, November 8, 2026'
  ]);
});

test('buildDateList: leaves out days before today, but keeps today', () => {
  const ctx = load({}, new Date(2026, 10, 4, 15, 0)); // Wed Nov 4, 3 PM
  assert.deepStrictEqual(plain(ctx.buildDateList('2026-11-02', '2026-11-05', [])), [
    'Wednesday, November 4, 2026',
    'Thursday, November 5, 2026'
  ]);
});

test('buildDateList: crosses month and year boundaries', () => {
  const ctx = load({}, new Date(2026, 11, 1));
  const dates = plain(ctx.buildDateList('2026-12-31', '2027-01-01', []));
  assert.deepStrictEqual(dates, ['Thursday, December 31, 2026', 'Friday, January 1, 2027']);
});

test('buildExcludedDateSet: expands ranges inclusively, across months', () => {
  const ctx = load();
  const set = ctx.buildExcludedDateSet([['2026-11-29', '2026-12-02'], '2026-12-25']);
  assert.deepStrictEqual([...set].sort(),
    ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-25']);
  assert.strictEqual(ctx.buildExcludedDateSet(undefined).size, 0);
});

test('parseExcludeDatesText: the admin form\'s "dates to exclude" answer', () => {
  const ctx = load();
  assert.deepStrictEqual(plain(ctx.parseExcludeDatesText('2026-11-05, 2026-11-09 to 2026-11-11')),
    ['2026-11-05', ['2026-11-09', '2026-11-11']]);
  assert.deepStrictEqual(plain(ctx.parseExcludeDatesText('2026-11-09 TO 2026-11-11')),
    [['2026-11-09', '2026-11-11']], '"to" is matched in any case');
  assert.deepStrictEqual(plain(ctx.parseExcludeDatesText(' 2026-11-05 ,, ')), ['2026-11-05'],
    'stray commas and spaces are ignored');
  assert.deepStrictEqual(plain(ctx.parseExcludeDatesText('')), []);
});

test('parseDateLabel: reads a dropdown label back into a date', () => {
  const ctx = load();
  const d = ctx.parseDateLabel('Monday, November 2, 2026');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 10);
  assert.strictEqual(d.getDate(), 2);
  assert.strictEqual(ctx.parseDateLabel('(All dates are filled)'), null);
  assert.strictEqual(ctx.parseDateLabel('Monday, Smarch 2, 2026'), null);
});

test('sanitizePersonKey: one stable key per person, whatever the spacing and punctuation', () => {
  const ctx = load();
  assert.strictEqual(ctx.sanitizePersonKey('The Johnson Family'), 'the-johnson-family');
  assert.strictEqual(ctx.sanitizePersonKey('  Sister O\'Brien — surgery  '), 'sister-o-brien-surgery');
  assert.strictEqual(ctx.sanitizePersonKey('the johnson family'), ctx.sanitizePersonKey('The Johnson  Family'),
    'names differing only in case or spacing are the same person');
  assert.throws(() => ctx.sanitizePersonKey('  — '), /at least one letter or number/);
});

test('sanitizeCell: stops typed text from being run as a spreadsheet formula', () => {
  const ctx = load();
  assert.strictEqual(ctx.sanitizeCell('=HYPERLINK("http://evil")'), '\'=HYPERLINK("http://evil")');
  assert.strictEqual(ctx.sanitizeCell('+1 555 0100'), "'+1 555 0100");
  assert.strictEqual(ctx.sanitizeCell('-5'), "'-5");
  assert.strictEqual(ctx.sanitizeCell('@home'), "'@home");
  assert.strictEqual(ctx.sanitizeCell('Smith Family'), 'Smith Family');
  assert.strictEqual(ctx.sanitizeCell(null), '');
  assert.strictEqual(ctx.sanitizeCell(undefined), '');
  assert.strictEqual(ctx.sanitizeCell(5550100), '5550100');
});

test('escapeIcsText: escapes the characters calendar files treat specially', () => {
  const ctx = load();
  assert.strictEqual(ctx.escapeIcsText('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne');
});

test('getProp / setProp: every setting is stored under that person\'s own key', () => {
  const ctx = load();
  const props = ctx.PropertiesService.getScriptProperties();
  ctx.setProp(props, 'jane-doe', 'FORM_ID', 'f1');
  ctx.setProp(props, 'the-smiths', 'FORM_ID', 'f2');
  assert.strictEqual(ctx.getProp(props, 'jane-doe', 'FORM_ID'), 'f1');
  assert.strictEqual(ctx.getProp(props, 'the-smiths', 'FORM_ID'), 'f2');
  assert.strictEqual(ctx.$.properties['p:jane-doe:FORM_ID'], 'f1');
});

test('registerPerson: adds each person once, keeping the first name given', () => {
  const ctx = load();
  const props = ctx.PropertiesService.getScriptProperties();
  ctx.registerPerson(props, 'jane-doe', 'Jane Doe');
  ctx.registerPerson(props, 'the-smiths', 'The Smiths');
  ctx.registerPerson(props, 'jane-doe', 'Jane  Doe');
  assert.deepStrictEqual(JSON.parse(ctx.$.properties.PEOPLE),
    [{ key: 'jane-doe', name: 'Jane Doe' }, { key: 'the-smiths', name: 'The Smiths' }]);
});
