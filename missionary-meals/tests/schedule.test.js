'use strict';
/**
 * The core invariant of the whole script.
 *
 * Three separate pieces of code independently produce or parse the
 * date label 'Thursday, September 24, 2026': buildDateList() for the
 * form dropdown, buildCalendarBlocks() for the SCHEDULE_MAP keys, and
 * parseDateLabel() for reading them back. Every lookup in the script
 * assumes all three agree exactly. If they ever drift, sign-ups stop
 * matching their calendar squares and the failure is silent.
 */

const test = require('node:test');
const assert = require('node:assert');

const harness = require('./harness');

const JULY_1 = new Date(2026, 6, 1, 9, 0); // well before the file's START_DATE

test('every calendar date label round-trips through parseDateLabel', () => {
  const ctx = harness.load({ now: JULY_1 });
  const blocks = ctx.buildCalendarBlocks(new Date('2026-09-01T00:00:00'), new Date('2026-10-31T00:00:00'));

  const labels = blocks
    .flatMap(b => b.weeks.flat())
    .filter(cell => cell && cell.status === 'available')
    .map(cell => cell.dateLabel);

  assert.ok(labels.length > 40, 'expected two months of dates, got ' + labels.length);

  labels.forEach(label => {
    const parsed = ctx.parseDateLabel(label);
    assert.ok(parsed, 'parseDateLabel returned null for ' + label);
    const iso = [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0')
    ].join('-');
    const cell = blocks.flatMap(b => b.weeks.flat()).find(c => c && c.dateLabel === label);
    assert.strictEqual(iso, cell.isoDate, 'round-trip mismatch for ' + label);
  });
});

test('buildDateList labels match the calendar labels exactly', () => {
  // Driven off the file's own START_DATE/END_DATE so this keeps working
  // when those get changed each month.
  const ctx = harness.load({ now: JULY_1 });
  const { START_DATE, END_DATE } = ctx.CONST;

  const dropdownLabels = ctx.buildDateList();
  const calendarLabels = ctx
    .buildCalendarBlocks(new Date(START_DATE + 'T00:00:00'), new Date(END_DATE + 'T00:00:00'))
    .flatMap(b => b.weeks.flat())
    .filter(cell => cell && cell.status === 'available')
    .map(cell => cell.dateLabel);

  assert.deepStrictEqual(dropdownLabels, calendarLabels,
    'the dropdown and the calendar must use identical date labels');
});

test('no Mondays are ever offered', () => {
  const ctx = harness.load({ now: JULY_1 });
  const blocks = ctx.buildCalendarBlocks(new Date('2026-09-01T00:00:00'), new Date('2026-09-30T00:00:00'));

  blocks.flatMap(b => b.weeks.flat())
    .filter(cell => cell && cell.status === 'available')
    .forEach(cell => {
      const day = ctx.parseDateLabel(cell.dateLabel).getDay();
      assert.notStrictEqual(day, 1, cell.dateLabel + ' is a Monday and should not be available');
    });

  // and Mondays are still drawn, just marked closed
  const mondays = blocks.flatMap(b => b.weeks.flat())
    .filter(cell => cell && cell.status === 'closed');
  assert.ok(mondays.length >= 4, 'September has at least four Mondays on the calendar');
});

test('buildDateList drops dates that have already passed', () => {
  const ctx = harness.load({ now: JULY_1 });
  const { START_DATE, END_DATE } = ctx.CONST;

  // Freeze the clock midway through the configured range
  const start = new Date(START_DATE + 'T00:00:00');
  const end = new Date(END_DATE + 'T00:00:00');
  const middle = new Date((start.getTime() + end.getTime()) / 2);
  middle.setHours(12, 0, 0, 0);

  const midCtx = harness.load({ now: middle });
  const labels = midCtx.buildDateList();

  labels.forEach(label => {
    const d = midCtx.parseDateLabel(label);
    assert.ok(d >= new Date(middle.getFullYear(), middle.getMonth(), middle.getDate()),
      label + ' is in the past and should not be offered');
  });
  assert.ok(labels.length > 0, 'mid-range should still have dates left');
});

test('parseDateLabel rejects things that are not date labels', () => {
  const ctx = harness.load({ now: JULY_1 });
  assert.strictEqual(ctx.parseDateLabel(ctx.CONST.ALL_FILLED_CHOICE), null);
  assert.strictEqual(ctx.parseDateLabel('not a date'), null);
  assert.strictEqual(ctx.parseDateLabel('Thursday, Smarch 40, 2026'), null);
});

test('the schedule map points every date at its own square', () => {
  const fixtures = require('./fixtures');
  const ctx = fixtures.withSchedule({ now: JULY_1, from: '2026-09-01', to: '2026-09-30' });

  Object.keys(ctx.dateMap).forEach(label => {
    const ref = ctx.dateMap[label];
    const text = ctx.sheet.getRange(ref.row, ref.col).getValue();
    const dayOnCalendar = Number(String(text).split('\n')[0]);
    const dayInLabel = ctx.parseDateLabel(label).getDate();
    assert.strictEqual(dayOnCalendar, dayInLabel,
      label + ' maps to a square showing day ' + dayOnCalendar);
  });
});
