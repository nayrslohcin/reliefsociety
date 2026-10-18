'use strict';
/**
 * The public schedule: buildCalendarBlocks() lays the dates out as
 * calendar months, renderSchedule() draws them, and greyOutPastDates()
 * marks the days that went by with nobody signed up.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, person, plain } = require('./fixtures');
const { GREEN } = require('./apps-script-fakes');

test('buildCalendarBlocks: one block per month, with weeks running Sunday to Saturday', () => {
  const ctx = load();
  const blocks = ctx.buildCalendarBlocks(new Date(2026, 10, 30), new Date(2026, 11, 2), []);

  assert.deepStrictEqual(plain(blocks.map(b => b.key)), ['2026-11', '2026-12']);
  assert.deepStrictEqual(plain(blocks.map(b => b.label)), ['November 2026', 'December 2026']);

  // November 1, 2026 is a Sunday, so the first week is full
  const nov = blocks[0];
  assert.strictEqual(nov.weeks[0][0].day, 1);
  assert.strictEqual(nov.weeks.length, 5);
  // December 1, 2026 is a Tuesday: Sunday and Monday of that week are empty
  const decWeek1 = blocks[1].weeks[0];
  assert.strictEqual(decWeek1[0], null);
  assert.strictEqual(decWeek1[1], null);
  assert.strictEqual(decWeek1[2].day, 1);
});

test('buildCalendarBlocks: marks each day available, excluded, or outside the range', () => {
  const ctx = load();
  const [nov] = ctx.buildCalendarBlocks(new Date(2026, 10, 2), new Date(2026, 10, 4), ['2026-11-03']);
  const days = nov.weeks.flat().filter(d => d);
  const status = day => days.find(d => d.day === day).status;

  assert.strictEqual(status(1), 'n/a');
  assert.strictEqual(status(2), 'available');
  assert.strictEqual(status(3), 'excluded');
  assert.strictEqual(status(4), 'available');
  assert.strictEqual(status(5), 'n/a');

  const nov2 = days.find(d => d.day === 2);
  assert.strictEqual(nov2.dateLabel, 'Monday, November 2, 2026');
  assert.strictEqual(nov2.isoDate, '2026-11-02');
  assert.strictEqual(days.find(d => d.day === 3).dateLabel, null, 'excluded days are not sign-up choices');
});

test('buildCalendarBlocks: labels match the dropdown labels exactly', () => {
  // The schedule map is looked up by dropdown label, so the two must agree
  const ctx = load();
  const blocks = ctx.buildCalendarBlocks(new Date(2026, 10, 2), new Date(2026, 10, 8), ['2026-11-04']);
  const fromCalendar = blocks[0].weeks.flat().filter(d => d && d.status === 'available').map(d => d.dateLabel);
  assert.deepStrictEqual(plain(fromCalendar), plain(ctx.buildDateList('2026-11-02', '2026-11-08', ['2026-11-04'])));
});

test('renderSchedule: draws the month title, weekday header and day squares', () => {
  const ctx = load();
  const ss = ctx.SpreadsheetApp.create('Schedule');
  const blocks = ctx.buildCalendarBlocks(new Date(2026, 10, 2), new Date(2026, 10, 3), ['2026-11-03']);
  const map = ctx.renderSchedule(ss, blocks);
  const sheet = ss.getSheetByName('Schedule');

  assert.ok(sheet, 'the first tab is renamed "Schedule"');
  assert.strictEqual(sheet.getRange(1, 1).getValue(), 'November 2026');
  assert.deepStrictEqual(sheet.rowValues(2, 7), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.deepStrictEqual(sheet.rowValues(3, 4), ['1', '2\n— available —', '3\n(not needed)', '4']);

  // Only available days are in the map, pointing at their square
  assert.deepStrictEqual(Object.keys(map), ['Monday, November 2, 2026']);
  assert.deepStrictEqual({ ...map['Monday, November 2, 2026'] }, { row: 3, col: 2, iso: '2026-11-02' });
});

test('renderSchedule: a second call starting lower down leaves the first month alone', () => {
  const ctx = load();
  const ss = ctx.SpreadsheetApp.create('Schedule');
  ctx.renderSchedule(ss, ctx.buildCalendarBlocks(new Date(2026, 10, 2), new Date(2026, 10, 2), []));
  const sheet = ss.getSheetByName('Schedule');
  const start = sheet.getLastRow() + 2;

  const map = ctx.renderSchedule(ss,
    ctx.buildCalendarBlocks(new Date(2026, 11, 1), new Date(2026, 11, 1), []), start);

  assert.strictEqual(sheet.getRange(1, 1).getValue(), 'November 2026');
  assert.strictEqual(sheet.getRange(start, 1).getValue(), 'December 2026');
  assert.strictEqual(map['Tuesday, December 1, 2026'].row, start + 2);
});

test('greyOutPastDates: marks past empty days, and leaves claimed and future days alone', () => {
  const ctx = load();
  const p = person(ctx, { startDate: '2026-11-02', endDate: '2026-11-05' });
  ctx.claimDate(ctx.PropertiesService.getScriptProperties(), p.key, p.form,
    p.label('2026-11-02'), 'Smith Family', '');

  const nov4 = new Date(2026, 10, 4);
  ctx.greyOutPastDates(p.sheet, p.map, nov4);

  assert.strictEqual(p.square('2026-11-02'), '2\nSmith Family', 'a claimed past day keeps its name');
  assert.strictEqual(p.squareColor('2026-11-02'), GREEN);
  assert.strictEqual(p.square('2026-11-03'), '3\n(past)');
  assert.strictEqual(p.squareColor('2026-11-03'), '#efefef');
  assert.strictEqual(p.square('2026-11-04'), '4\n— available —', 'today is not past');
});
