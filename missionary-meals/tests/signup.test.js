'use strict';
/**
 * claimDate() is the heart of the script: it is what runs when someone
 * signs up, whether through the form or the "Quick Add" tab.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');

const SEPT_1 = new Date(2026, 8, 1, 10, 0);
const SEPT = { now: SEPT_1, from: '2026-09-01', to: '2026-09-30' };

test('a sign-up writes the name, colours the square and takes the date off the form', () => {
  const ctx = fixtures.withSchedule(SEPT);
  const label = fixtures.labelFor(ctx, '2026-09-24');

  const error = ctx.claimDate(ctx.$.form, label, 'Smith Family', '');

  assert.strictEqual(error, null);
  assert.strictEqual(fixtures.square(ctx, label), '24\nSmith Family');
  assert.strictEqual(fixtures.squareColor(ctx, label), '#93c47d');
  assert.ok(!fixtures.choices(ctx).includes(label), 'claimed date should leave the dropdown');
  assert.ok(ctx.$.form.isAcceptingResponses(), 'form stays open while dates remain');
});

test('a date that is not on the dropdown is refused and changes nothing', () => {
  const ctx = fixtures.withSchedule(SEPT);
  const label = fixtures.labelFor(ctx, '2026-09-24');
  ctx.claimDate(ctx.$.form, label, 'First Family', '');

  const before = fixtures.choices(ctx);
  const error = ctx.claimDate(ctx.$.form, label, 'Second Family', '');

  assert.match(error, /not an open date/);
  assert.strictEqual(fixtures.square(ctx, label), '24\nFirst Family',
    'the original sign-up must not be overwritten');
  assert.deepStrictEqual(fixtures.choices(ctx), before);
});

test('claiming the last date closes the form with the placeholder', () => {
  const ctx = fixtures.withSchedule(SEPT);
  const last = ctx.allDates[ctx.allDates.length - 1];
  const ctxOne = fixtures.withSchedule(Object.assign({}, SEPT, { choices: [last] }));

  const error = ctxOne.claimDate(ctxOne.$.form, last, 'Last Family', '');

  assert.strictEqual(error, null);
  assert.deepStrictEqual(fixtures.choices(ctxOne), [ctxOne.CONST.ALL_FILLED_CHOICE]);
  assert.strictEqual(ctxOne.$.form.isAcceptingResponses(), false);
  assert.strictEqual(ctxOne.$.form.getCustomClosedFormMessage(), ctxOne.CONST.FULL_MESSAGE);
});

test('a confirmation email goes out only when an address was given', () => {
  const withEmail = fixtures.withSchedule(SEPT);
  withEmail.claimDate(withEmail.$.form, fixtures.labelFor(withEmail, '2026-09-24'),
    'Smith Family', 'smith@example.test');
  assert.strictEqual(withEmail.$.sentMail.length, 1);
  assert.strictEqual(withEmail.$.sentMail[0].to, 'smith@example.test');
  assert.match(withEmail.$.sentMail[0].subject, /signed up to feed the missionaries/);
  assert.strictEqual(withEmail.$.sentMail[0].attachments.length, 1,
    'the .ics calendar invite should be attached');

  const noEmail = fixtures.withSchedule(SEPT);
  noEmail.claimDate(noEmail.$.form, fixtures.labelFor(noEmail, '2026-09-24'), 'Smith Family', '');
  assert.strictEqual(noEmail.$.sentMail.length, 0, 'no address means no email');
});

test('a blank-looking email address does not trigger a send', () => {
  const ctx = fixtures.withSchedule(SEPT);
  const label = fixtures.labelFor(ctx, '2026-09-24');

  // What a "Quick Add" row with a stray space in the Email column gives us
  ctx.claimDate(ctx.$.form, label, 'Smith Family', '   ');
  assert.strictEqual(ctx.$.sentMail.length, 0);

  // and undefined, which is what an empty spreadsheet cell can produce
  const ctx2 = fixtures.withSchedule(SEPT);
  ctx2.claimDate(ctx2.$.form, fixtures.labelFor(ctx2, '2026-09-24'), 'Smith Family', undefined);
  assert.strictEqual(ctx2.$.sentMail.length, 0);
});

test('the email question is found even on a form built before it was renamed', () => {
  const ctx = fixtures.withSchedule(SEPT);

  const responses = title => [{
    getItem: () => ({ getTitle: () => title }),
    getResponse: () => 'someone@example.test'
  }];

  assert.strictEqual(ctx.findEmailResponse(responses(ctx.CONST.Q_EMAIL)), 'someone@example.test');
  assert.strictEqual(
    ctx.findEmailResponse(responses('Email address (for your confirmation + calendar invite)')),
    'someone@example.test',
    'the pre-rename question title must still match');
  assert.strictEqual(ctx.findEmailResponse([]), '', 'a skipped optional question gives empty string');
});

test('the calendar invite covers the right day at the configured meal time', () => {
  const ctx = fixtures.withSchedule(SEPT);
  ctx.claimDate(ctx.$.form, fixtures.labelFor(ctx, '2026-09-24'), 'Smith Family', 'a@example.test');

  const ics = ctx.$.sentMail[0].attachments[0].content;
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:20260924T/, 'the invite should be for September 24');
  assert.match(ics, /SUMMARY:Missionary Dinner/);
});
