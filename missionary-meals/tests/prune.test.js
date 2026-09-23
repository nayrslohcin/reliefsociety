'use strict';
/**
 * pruneOldDates() clears dates that have gone by. The thing it must
 * never do is disturb a day someone actually signed up for — that is
 * the calendar's record of who fed the missionaries.
 *
 * Clock is Tuesday 22 September 2026, so the 17th and 19th are past
 * and the 24th is still to come.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');

const SEPT_22 = new Date(2026, 8, 22, 20, 0);
const SEPT = { now: SEPT_22, from: '2026-09-01', to: '2026-09-30' };

const PAST_A = 'Thursday, September 17, 2026';
const PAST_B = 'Saturday, September 19, 2026';
const FUTURE = 'Thursday, September 24, 2026';

test('past dates come off the dropdown and future ones stay', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST_A, PAST_B, FUTURE] }));

  ctx.pruneOldDates();

  assert.deepStrictEqual(fixtures.choices(ctx), [FUTURE]);
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), true);
});

test('past squares are marked, and a claimed one keeps its name', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST_A, PAST_B, FUTURE] }));
  // Somebody fed the missionaries on the 19th. claimDate only accepts a
  // date that is actually on the dropdown, so assert the setup took —
  // otherwise this test would "pass" against a square nobody claimed.
  assert.strictEqual(ctx.claimDate(ctx.$.form, PAST_B, 'Smith Family', ''), null);

  ctx.pruneOldDates();

  assert.strictEqual(fixtures.square(ctx, PAST_A), '17\n(past)');
  assert.strictEqual(fixtures.square(ctx, PAST_B), '19\nSmith Family',
    'a claimed day must keep its name');
  assert.strictEqual(fixtures.squareColor(ctx, PAST_B), '#93c47d');
  assert.match(String(fixtures.square(ctx, FUTURE)), /available/,
    'a future day is left alone');
});

test('pruning the last open date closes the form', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST_A, PAST_B] }));

  ctx.pruneOldDates();

  assert.deepStrictEqual(fixtures.choices(ctx), [ctx.CONST.ALL_FILLED_CHOICE]);
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false);
  assert.strictEqual(ctx.$.form.getCustomClosedFormMessage(), ctx.CONST.FULL_MESSAGE);
});

test('running it twice changes nothing the second time', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST_A, PAST_B, FUTURE] }));

  ctx.pruneOldDates();
  const after = fixtures.choices(ctx);
  const square = fixtures.square(ctx, PAST_A);

  ctx.pruneOldDates();

  assert.deepStrictEqual(fixtures.choices(ctx), after);
  assert.strictEqual(fixtures.square(ctx, PAST_A), square);
});

test('previewOldDates reports what would happen and changes nothing', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST_A, PAST_B, FUTURE] }));
  const before = {
    choices: fixtures.choices(ctx),
    accepting: ctx.$.form.isAcceptingResponses(),
    square: fixtures.square(ctx, PAST_A)
  };

  ctx.previewOldDates();

  assert.deepStrictEqual(fixtures.choices(ctx), before.choices, 'dry run must not touch the form');
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), before.accepting);
  assert.strictEqual(fixtures.square(ctx, PAST_A), before.square, 'dry run must not touch the calendar');

  const log = ctx.$.logs.join('\n');
  assert.match(log, /DRY RUN/);
  assert.match(log, /would REMOVE these 2 past date/);
  assert.ok(log.includes(PAST_A) && log.includes(PAST_B), 'both stale dates should be named');
  assert.match(log, /would KEEP these 1 date/);
});

test('the dry run and the real run agree on what is stale', () => {
  const opts = Object.assign({}, SEPT, { choices: [PAST_A, PAST_B, FUTURE] });

  const dry = fixtures.withSchedule(opts);
  dry.previewOldDates();
  const named = [PAST_A, PAST_B].filter(d => dry.$.logs.join('\n').includes(d));

  const real = fixtures.withSchedule(opts);
  const before = fixtures.choices(real);
  real.pruneOldDates();
  const removed = before.filter(c => !fixtures.choices(real).includes(c));

  assert.deepStrictEqual(removed.sort(), named.sort());
});

test('nothing stale is reported plainly', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [FUTURE] }));
  ctx.pruneOldDates();
  assert.match(ctx.$.logs.join('\n'), /No past dates on the sign-up dropdown/);
  assert.deepStrictEqual(fixtures.choices(ctx), [FUTURE]);
});

test('setupPruneTrigger replaces only its own trigger', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: [FUTURE],
    triggers: ['onSignup', 'onResponsesEdit', 'checkSundaySchedule', 'pruneOldDates']
  }));

  ctx.setupPruneTrigger();

  const handlers = ctx.$.triggers.map(t => t.getHandlerFunction()).sort();
  assert.deepStrictEqual(handlers,
    ['checkSundaySchedule', 'onResponsesEdit', 'onSignup', 'pruneOldDates']);
  assert.deepStrictEqual(Array.from(ctx.$.deletedTriggers), ['pruneOldDates']);
});

test('setting up the trigger does not prune there and then', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST_A, FUTURE] }));
  ctx.setupPruneTrigger();
  assert.ok(fixtures.choices(ctx).includes(PAST_A),
    'the dry run should still be worth running afterwards');
});
