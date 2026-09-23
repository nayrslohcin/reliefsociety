'use strict';
/**
 * releaseDate() is what "Quick Cancel" and cancelSignup() run when
 * someone backs out. It has to put the date back in the right place in
 * the dropdown and take the person off the roster.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');

const SEPT_22 = new Date(2026, 8, 22, 20, 0);
const SEPT = { now: SEPT_22, from: '2026-09-01', to: '2026-09-30' };

const PAST = 'Thursday, September 17, 2026';
const SEPT_24 = 'Thursday, September 24, 2026';
const SEPT_26 = 'Saturday, September 26, 2026';
const SEPT_29 = 'Tuesday, September 29, 2026';

test('a cancelled date goes back on the form and the square clears', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [SEPT_24, SEPT_29] }));
  assert.strictEqual(ctx.claimDate(ctx.$.form, SEPT_24, 'Smith Family', ''), null);

  const result = ctx.releaseDate(ctx.$.form, SEPT_24);

  assert.strictEqual(result, null);
  assert.ok(fixtures.choices(ctx).includes(SEPT_24), 'the date should be available again');
  assert.match(String(fixtures.square(ctx, SEPT_24)), /available/);
  assert.notStrictEqual(fixtures.squareColor(ctx, SEPT_24), '#93c47d', 'square is no longer claimed');
});

test('a reopened date lands back in date order, not at the end', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: [SEPT_24, SEPT_26, SEPT_29]
  }));
  assert.strictEqual(ctx.claimDate(ctx.$.form, SEPT_26, 'Smith Family', ''), null);
  assert.deepStrictEqual(fixtures.choices(ctx), [SEPT_24, SEPT_29]);

  ctx.releaseDate(ctx.$.form, SEPT_26);

  assert.deepStrictEqual(fixtures.choices(ctx), [SEPT_24, SEPT_26, SEPT_29],
    'the 26th belongs between the 24th and the 29th');
});

test('cancelling reopens a form that had closed because it filled up', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [SEPT_24] }));
  ctx.claimDate(ctx.$.form, SEPT_24, 'Smith Family', '');
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false, 'setup: form filled up');

  ctx.releaseDate(ctx.$.form, SEPT_24);

  assert.strictEqual(ctx.$.form.isAcceptingResponses(), true);
  assert.deepStrictEqual(fixtures.choices(ctx), [SEPT_24],
    'the placeholder should be gone');
});

test('a date that has already passed is cleared but not reopened', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [PAST, SEPT_24] }));
  ctx.claimDate(ctx.$.form, PAST, 'Smith Family', '');

  const result = ctx.releaseDate(ctx.$.form, PAST);

  assert.match(result, /already passed/);
  assert.strictEqual(fixtures.square(ctx, PAST), '17\n(past)');
  assert.ok(!fixtures.choices(ctx).includes(PAST),
    'a past date must not go back on the form');
});

test('cancelling takes the row off the responses roster', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [SEPT_24, SEPT_29] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Name', 'Phone', 'Email', 'Date']);
  roster.appendRow([new Date(), 'Smith Family', '555', '', SEPT_24]);
  roster.appendRow([new Date(), 'Jones Family', '555', '', SEPT_29]);

  ctx.releaseDate(ctx.$.form, SEPT_24);

  const remaining = roster.getRange(2, 5, roster.getLastRow() - 1, 1).getValues().flat();
  assert.deepStrictEqual(remaining, [SEPT_29],
    'only the cancelled row should be gone');
});

test('cancelling a date that is not on the calendar reports it', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [SEPT_24] }));
  const result = ctx.releaseDate(ctx.$.form, 'Friday, December 25, 2026');
  assert.match(result, /Could not find/);
});
