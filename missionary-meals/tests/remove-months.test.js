'use strict';
/**
 * removeOldMonths() is the most dangerous function in the file.
 *
 * SCHEDULE_MAP stores each date's exact row number on the schedule
 * sheet. Deleting a month's rows shifts every month below it upwards,
 * so the saved row numbers have to be repaired in the same step. Get it
 * wrong and the script keeps running happily while writing names into
 * the wrong calendar squares — no error, no log, just a wrong calendar.
 *
 * That is what these tests are for. Clock is 22 September 2026, so
 * August is safely finished.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');
const { plain } = require('./harness');

const SEPT_22 = new Date(2026, 8, 22, 20, 0);

/** Two month blocks drawn on one sheet: August above, September below. */
function twoMonths(config) {
  return fixtures.withSchedule({
    now: SEPT_22,
    from: '2026-08-01',
    to: '2026-09-30',
    config: config
  });
}

/**
 * The invariant: every date left in SCHEDULE_MAP points at a square
 * whose day number matches that date.
 */
function assertMapIsIntact(ctx, mapAfter) {
  const labels = Object.keys(mapAfter);
  assert.ok(labels.length > 0, 'expected dates to survive the removal');

  labels.forEach(label => {
    const ref = mapAfter[label];
    const text = String(ctx.sheet.getRange(ref.row, ref.col).getValue());
    const dayOnCalendar = Number(text.split('\n')[0]);
    const dayInLabel = ctx.parseDateLabel(label).getDate();
    assert.strictEqual(dayOnCalendar, dayInLabel,
      label + ' now points at row ' + ref.row + ' col ' + ref.col +
      ', which shows day ' + dayOnCalendar);
  });
}

function mapAfter(ctx) {
  return JSON.parse(ctx.$.properties.SCHEDULE_MAP);
}

test('removing a finished month keeps every surviving date on its own square', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-08'" });

  ctx.removeOldMonths();

  const after = mapAfter(ctx);
  assert.ok(!Object.keys(after).some(l => l.includes('August')),
    'August dates should be gone from the map');
  assert.ok(Object.keys(after).some(l => l.includes('September')),
    'September dates should remain');
  assertMapIsIntact(ctx, after);
});

test('a name already on the calendar survives the row shift', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-08'" });
  const claimed = 'Thursday, September 24, 2026';
  assert.strictEqual(ctx.claimDate(ctx.$.form, claimed, 'Smith Family', ''), null);

  ctx.removeOldMonths();

  const after = mapAfter(ctx);
  const ref = after[claimed];
  assert.strictEqual(ctx.sheet.getRange(ref.row, ref.col).getValue(), '24\nSmith Family',
    'the sign-up must still be under the date it belongs to');
  assert.strictEqual(ctx.sheet.getRange(ref.row, ref.col).getBackground(), '#93c47d');
});

test('a later sign-up still lands in the right square after a removal', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-08'" });
  ctx.removeOldMonths();

  // This is the failure mode the whole test file exists for: the script
  // carries on using SCHEDULE_MAP after rows moved.
  const label = 'Saturday, September 26, 2026';
  assert.strictEqual(ctx.claimDate(ctx.$.form, label, 'Jones Family', ''), null);

  const ref = mapAfter(ctx)[label];
  assert.strictEqual(ctx.sheet.getRange(ref.row, ref.col).getValue(), '26\nJones Family');
});

test('removed dates are taken off the sign-up dropdown', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-08'" });
  assert.ok(fixtures.choices(ctx).some(c => c.includes('August')), 'setup: August was offered');

  ctx.removeOldMonths();

  assert.ok(!fixtures.choices(ctx).some(c => c.includes('August')),
    'no August date should remain selectable');
  assert.ok(fixtures.choices(ctx).some(c => c.includes('September')));
});

test('the removed month is forgotten so it could be added again', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-08'" });
  ctx.removeOldMonths();
  assert.deepStrictEqual(JSON.parse(ctx.$.properties.ADDED_MONTHS), ['2026-09']);
});

test('it refuses to remove the current month without the force flag', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-09'" });
  const before = JSON.stringify(mapAfter(ctx));

  assert.throws(() => ctx.removeOldMonths(), /Refusing to remove 2026-09/);
  assert.strictEqual(JSON.stringify(mapAfter(ctx)), before, 'nothing should have changed');
});

test('the force flag allows it, for when you really mean it', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-09'", REMOVE_MONTHS_FORCE: 'true' });
  ctx.removeOldMonths();

  const after = mapAfter(ctx);
  assert.ok(!Object.keys(after).some(l => l.includes('September')));
  assertMapIsIntact(ctx, after);
});

test('removing every month closes the form', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-08,2026-09'", REMOVE_MONTHS_FORCE: 'true' });
  ctx.removeOldMonths();

  assert.deepStrictEqual(fixtures.choices(ctx), [ctx.CONST.ALL_FILLED_CHOICE]);
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false);
  assert.strictEqual(ctx.$.form.getCustomClosedFormMessage(), ctx.CONST.FULL_MESSAGE);
});

test('a malformed REMOVE_MONTHS is rejected before anything is touched', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'August 2026'" });
  const before = JSON.stringify(mapAfter(ctx));

  assert.throws(() => ctx.removeOldMonths(), /must be month\(s\) in yyyy-mm form/);
  assert.strictEqual(JSON.stringify(mapAfter(ctx)), before);
});

test('an empty REMOVE_MONTHS tells you what to set', () => {
  const ctx = twoMonths({});
  assert.throws(() => ctx.removeOldMonths(), /Set REMOVE_MONTHS/);
});

test('a month that was never on the schedule is skipped, not fatal', () => {
  const ctx = twoMonths({ REMOVE_MONTHS: "'2026-01'" });
  ctx.removeOldMonths();

  assert.match(ctx.$.logs.join('\n'), /Not on the schedule, skipping: 2026-01/);
  assertMapIsIntact(ctx, mapAfter(ctx));
});

test('findMonthBlocks locates each month drawn on the sheet', () => {
  const ctx = twoMonths({});
  const blocks = ctx.findMonthBlocks(ctx.sheet);

  assert.deepStrictEqual(plain(blocks.map(b => b.key)), ['2026-08', '2026-09']);
  assert.ok(blocks[0].startRow < blocks[1].startRow, 'August is drawn above September');
  assert.ok(blocks[0].endRow < blocks[1].startRow, 'blocks must not overlap');
});

test('monthTitleToKey only accepts real month titles', () => {
  const ctx = twoMonths({});
  assert.strictEqual(ctx.monthTitleToKey('August 2026'), '2026-08');
  assert.strictEqual(ctx.monthTitleToKey('September 2026'), '2026-09');
  assert.strictEqual(ctx.monthTitleToKey('17\n— available —'), null);
  assert.strictEqual(ctx.monthTitleToKey('Sun'), null);
  assert.strictEqual(ctx.monthTitleToKey(''), null);
  assert.strictEqual(ctx.monthTitleToKey('Smarch 2026'), null);
});
