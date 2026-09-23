'use strict';
/**
 * checkSundaySchedule() runs every five minutes and owns whether the
 * form is open. The risk it carries is reopening a form that something
 * else closed on purpose, so most of these cases are about what it
 * must NOT do.
 *
 * September 2026: the 5th is a Saturday, the 6th a Sunday, the 9th a
 * Wednesday.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');

const SEPT = { from: '2026-09-01', to: '2026-09-30' };

const SUN_1AM = new Date(2026, 8, 6, 1, 0);
const SUN_630PM = new Date(2026, 8, 6, 18, 30);
const SUN_7PM = new Date(2026, 8, 6, 19, 0);
const SAT_11PM = new Date(2026, 8, 5, 23, 0);
const WED_NOON = new Date(2026, 8, 9, 12, 0);

/** A context whose dropdown holds one date still in the future. */
function open(now, extra) {
  return fixtures.withSchedule(Object.assign({
    now: now, from: SEPT.from, to: SEPT.to, choices: ['Thursday, September 24, 2026']
  }, extra));
}

test('the form stays open right up to midnight on Saturday', () => {
  const ctx = open(SAT_11PM, { accepting: true });
  ctx.checkSundaySchedule();
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), true);
});

test('Sunday morning closes the form with the pause message', () => {
  const ctx = open(SUN_1AM, { accepting: true });
  ctx.checkSundaySchedule();
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false);
  assert.strictEqual(ctx.$.form.getCustomClosedFormMessage(), ctx.CONST.PAUSED_MESSAGE);
});

test('the form is still paused at 6:30 PM and reopens at 7', () => {
  const evening = open(SUN_630PM, { accepting: true });
  evening.checkSundaySchedule();
  assert.strictEqual(evening.$.form.isAcceptingResponses(), false, 'still closed before 7 PM');

  const seven = open(SUN_7PM, { accepting: false, closedMessage: 'anything' });
  seven.checkSundaySchedule();
  assert.strictEqual(seven.$.form.isAcceptingResponses(), true, 'open again at 7 PM');
});

test('a form reopened by hand mid-Sunday gets closed again', () => {
  const ctx = open(SUN_1AM, { accepting: true, closedMessage: 'stale message' });
  ctx.checkSundaySchedule();
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false);
  assert.strictEqual(ctx.$.form.getCustomClosedFormMessage(), ctx.CONST.PAUSED_MESSAGE);
});

test('a full calendar is never reopened, whatever the day', () => {
  const placeholder = ctx => [ctx.CONST.ALL_FILLED_CHOICE];

  const wed = fixtures.withSchedule({ now: WED_NOON, from: SEPT.from, to: SEPT.to, choices: ['(All dates are filled)'], accepting: false });
  wed.$.form.closedMessage = wed.CONST.FULL_MESSAGE;
  wed.checkSundaySchedule();
  assert.strictEqual(wed.$.form.isAcceptingResponses(), false, 'must not reopen onto the placeholder');
  assert.strictEqual(wed.$.form.getCustomClosedFormMessage(), wed.CONST.FULL_MESSAGE);
  assert.deepStrictEqual(fixtures.choices(wed), placeholder(wed));

  const sunEvening = fixtures.withSchedule({ now: SUN_7PM, from: SEPT.from, to: SEPT.to, choices: ['(All dates are filled)'], accepting: false });
  sunEvening.$.form.closedMessage = sunEvening.CONST.PAUSED_MESSAGE;
  sunEvening.checkSundaySchedule();
  assert.strictEqual(sunEvening.$.form.isAcceptingResponses(), false, 'stays closed past 7 PM when full');
  assert.strictEqual(sunEvening.$.form.getCustomClosedFormMessage(), sunEvening.CONST.FULL_MESSAGE,
    'and goes back to saying the calendar is full');
});

test('the pause message wins on Sunday even when the calendar is full', () => {
  const ctx = fixtures.withSchedule({ now: SUN_1AM, from: SEPT.from, to: SEPT.to, choices: ['(All dates are filled)'], accepting: false });
  ctx.$.form.closedMessage = ctx.CONST.FULL_MESSAGE;
  ctx.checkSundaySchedule();
  assert.strictEqual(ctx.$.form.getCustomClosedFormMessage(), ctx.CONST.PAUSED_MESSAGE);
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), false);
});

test('a dropdown holding only past dates does not count as open', () => {
  const stale = ['Tuesday, September 1, 2026']; // past, with the clock on the 9th

  const wed = fixtures.withSchedule({ now: WED_NOON, from: SEPT.from, to: SEPT.to, choices: stale, accepting: true });
  wed.checkSundaySchedule();
  assert.strictEqual(wed.$.form.isAcceptingResponses(), false,
    'nothing left to sign up for, so the form should not stay open');

  const sunEvening = fixtures.withSchedule({ now: SUN_7PM, from: SEPT.from, to: SEPT.to, choices: ['Tuesday, September 1, 2026'], accepting: false });
  sunEvening.checkSundaySchedule();
  assert.strictEqual(sunEvening.$.form.isAcceptingResponses(), false,
    'and 7 PM must not reopen it either');
});

test('the five-minute run does not rewrite a message that is already right', () => {
  const ctx = open(SUN_1AM, { accepting: false, closedMessage: undefined });
  ctx.$.form.closedMessage = ctx.CONST.PAUSED_MESSAGE;
  let writes = 0;
  const original = ctx.$.form.setCustomClosedFormMessage.bind(ctx.$.form);
  ctx.$.form.setCustomClosedFormMessage = m => { writes++; return original(m); };

  ctx.checkSundaySchedule();
  assert.strictEqual(writes, 0, 'no pointless API write when nothing changed');
});

test('inSundayPause honours the PAUSE_DAY / REOPEN_HOUR settings', () => {
  const ctx = open(WED_NOON, {});
  assert.strictEqual(ctx.inSundayPause(new Date(2026, 8, 6, 0, 0)), true, 'midnight Sunday');
  assert.strictEqual(ctx.inSundayPause(new Date(2026, 8, 6, 18, 59)), true, 'just before 7 PM');
  assert.strictEqual(ctx.inSundayPause(new Date(2026, 8, 6, 19, 0)), false, '7 PM exactly');
  assert.strictEqual(ctx.inSundayPause(new Date(2026, 8, 5, 12, 0)), false, 'Saturday');
  assert.strictEqual(ctx.inSundayPause(new Date(2026, 8, 7, 3, 0)), false, 'Monday');
});

test('setupSundayTrigger replaces only its own trigger', () => {
  const ctx = fixtures.withSchedule({
    now: WED_NOON, from: SEPT.from, to: SEPT.to,
    choices: ['Thursday, September 24, 2026'],
    triggers: ['onSignup', 'onResponsesEdit', 'checkSundaySchedule']
  });

  ctx.setupSundayTrigger();

  const handlers = ctx.$.triggers.map(t => t.getHandlerFunction()).sort();
  assert.deepStrictEqual(handlers, ['checkSundaySchedule', 'onResponsesEdit', 'onSignup'],
    'the sign-up and edit triggers must survive');
  assert.deepStrictEqual(Array.from(ctx.$.deletedTriggers), ['checkSundaySchedule'],
    'only its own trigger should be deleted');
});
