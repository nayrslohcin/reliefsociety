'use strict';
/**
 * extendSignupForm() is what gets run each month to open up new dates.
 * It is the one routine operation on the live form, so the things it
 * must not do matter: add a month twice, or put a date back that
 * someone already claimed.
 *
 * Clock is 22 September 2026, with September already on the schedule.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');
const { plain } = require('./harness');

const SEPT_22 = new Date(2026, 8, 22, 20, 0);

function september(config) {
  return fixtures.withSchedule({
    now: SEPT_22,
    from: '2026-09-01',
    to: '2026-09-30',
    choices: ['Thursday, September 24, 2026', 'Saturday, September 26, 2026'],
    config: config
  });
}

const OCTOBER = { START_DATE: "'2026-10-01'", END_DATE: "'2026-10-31'" };

test('adding a new month keeps the existing open dates', () => {
  const ctx = september(OCTOBER);

  ctx.extendSignupForm();

  const choices = fixtures.choices(ctx);
  assert.ok(choices.includes('Thursday, September 24, 2026'), 'September dates should survive');
  assert.ok(choices.some(c => c.includes('October')), 'October dates should be added');
  assert.deepStrictEqual(plain(JSON.parse(ctx.$.properties.ADDED_MONTHS)), ['2026-09', '2026-10']);
});

test('running it twice with the same month changes nothing', () => {
  const ctx = september(OCTOBER);
  ctx.extendSignupForm();
  const after = fixtures.choices(ctx);
  const map = ctx.$.properties.SCHEDULE_MAP;

  ctx.extendSignupForm();

  assert.deepStrictEqual(fixtures.choices(ctx), after, 'no duplicate October dates');
  assert.strictEqual(ctx.$.properties.SCHEDULE_MAP, map, 'no second October block drawn');
  assert.match(ctx.$.logs.join('\n'), /Already added, skipping|Nothing to do/);
});

test('a date someone already claimed is not put back on the form', () => {
  const ctx = september(OCTOBER);
  const claimed = 'Thursday, September 24, 2026';
  assert.strictEqual(ctx.claimDate(ctx.$.form, claimed, 'Smith Family', ''), null);

  ctx.extendSignupForm();

  assert.ok(!fixtures.choices(ctx).includes(claimed),
    'a claimed date must not become available again');
  assert.strictEqual(fixtures.square(ctx, claimed), '24\nSmith Family');
});

test('dates that have passed are not carried forward', () => {
  const ctx = fixtures.withSchedule({
    now: SEPT_22,
    from: '2026-09-01',
    to: '2026-09-30',
    choices: ['Thursday, September 17, 2026', 'Thursday, September 24, 2026'],
    config: OCTOBER
  });

  ctx.extendSignupForm();

  assert.ok(!fixtures.choices(ctx).includes('Thursday, September 17, 2026'),
    'the 17th has passed and should be dropped');
  assert.ok(fixtures.choices(ctx).includes('Thursday, September 24, 2026'));
});

test('adding a month reopens a form that had filled up', () => {
  const ctx = fixtures.withSchedule({
    now: SEPT_22,
    from: '2026-09-01',
    to: '2026-09-30',
    choices: ['(All dates are filled)'],
    accepting: false,
    config: OCTOBER
  });

  ctx.extendSignupForm();

  assert.strictEqual(ctx.$.form.isAcceptingResponses(), true);
  assert.ok(!fixtures.choices(ctx).includes(ctx.CONST.ALL_FILLED_CHOICE),
    'the placeholder should be replaced by real dates');
});

test('a past range with nothing else open is refused', () => {
  // The guard fires when there would be no sign-up-able date left at
  // all. With future dates still on the dropdown it does not fire —
  // those dates are kept and the run is simply pointless, not harmful.
  const ctx = fixtures.withSchedule({
    now: SEPT_22,
    from: '2026-09-01',
    to: '2026-09-30',
    choices: ['(All dates are filled)'],
    accepting: false,
    config: { START_DATE: "'2026-01-01'", END_DATE: "'2026-01-31'" }
  });

  assert.throws(() => ctx.extendSignupForm(), /No available dates/);
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false,
    'a refused run must not leave the form open on the placeholder');
});

test('extending during the Sunday pause says so instead of looking broken', () => {
  const ctx = fixtures.withSchedule({
    now: new Date(2026, 8, 6, 10, 0), // Sunday morning
    from: '2026-09-01',
    to: '2026-09-30',
    choices: ['Thursday, September 24, 2026'],
    config: OCTOBER
  });

  ctx.extendSignupForm();

  assert.match(ctx.$.logs.join('\n'), /Sunday pause is on right now/);
});
