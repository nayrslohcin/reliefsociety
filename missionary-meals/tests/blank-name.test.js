'use strict';
/**
 * The live bug of 12 October 2026.
 *
 * Several people signed up. Their rows landed in "Form Responses 1",
 * but no name ever appeared on the calendar. The execution log showed:
 *
 *   Exception: Illegal argument.
 *       at claimDate(missionary-meal-signup.gs:1367:6)
 *       at onSignup(missionary-meal-signup.gs:1197:17)
 *
 * Line 1367 of the deployed version was the .setTextStyle() call that
 * bolds the name. Its range is (dayNumber.length + 1, cellText.length),
 * so the span is exactly name.length — and Google rejects a zero-length
 * range. A blank name therefore threw AFTER the date had been taken off
 * the form but BEFORE the square was written.
 *
 * The 71 tests in place at the time all passed, because the fake's
 * setTextStyle was a no-op. It validates offsets now.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');

const OCT_13 = new Date(2026, 9, 13, 10, 0);
const OCT = { now: OCT_13, from: '2026-10-01', to: '2026-10-31' };
const OCT_20 = 'Tuesday, October 20, 2026';
const OCT_22 = 'Thursday, October 22, 2026';

test('a sign-up with no name no longer throws', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20, OCT_22] }));

  const error = ctx.claimDate(ctx.$.form, OCT_20, '', '');

  assert.strictEqual(error, null, 'it must not throw and must not report failure');
  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\n(signed up)',
    'the day must still read as taken on the public calendar');
  assert.strictEqual(fixtures.squareColor(ctx, OCT_20), '#93c47d');
  assert.ok(!fixtures.choices(ctx).includes(OCT_20), 'and the date is still claimed');
});

test('a whitespace-only name is treated the same way', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  assert.strictEqual(ctx.claimDate(ctx.$.form, OCT_20, '   ', ''), null);
  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\n(signed up)');
});

test('a real name is still written and bolded as before', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  assert.strictEqual(ctx.claimDate(ctx.$.form, OCT_20, 'Smith Family', ''), null);
  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family');
});

test('the name is found even if the form question was renamed', () => {
  const ctx = fixtures.withSchedule(OCT);
  const responses = title => [{
    getItem: () => ({ getTitle: () => title }),
    getResponse: () => 'Smith Family'
  }];

  assert.strictEqual(ctx.findNameResponse(responses(ctx.CONST.Q_NAME)), 'Smith Family');
  assert.strictEqual(ctx.findNameResponse(responses('Name')), 'Smith Family',
    'a shortened question title must still be found');
  assert.strictEqual(ctx.findNameResponse(responses('Your Name:')), 'Smith Family');
  assert.strictEqual(ctx.findNameResponse(responses('Family name')), 'Smith Family');
  assert.strictEqual(ctx.findNameResponse([]), '', 'genuinely absent gives empty string');
});

test('finding the name does not pick up the phone or email answer', () => {
  const ctx = fixtures.withSchedule(OCT);
  const responses = [
    { getItem: () => ({ getTitle: () => 'Phone number' }), getResponse: () => '555-0100' },
    { getItem: () => ({ getTitle: () => ctx.CONST.Q_EMAIL }), getResponse: () => 'a@b.test' }
  ];
  assert.strictEqual(ctx.findNameResponse(responses), '',
    'neither the phone nor the email question may be mistaken for the name');
});

/* ---------- putting the lost sign-ups back ---------- */

/**
 * Recreates the live wreckage: roster rows exist, the dates are gone
 * from the form, and the squares were never written.
 */
function brokenState() {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, {
    choices: ['Saturday, October 24, 2026'] // the two taken dates already removed
  }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Smith Family', '555-0100', '', OCT_20]);
  roster.appendRow([new Date(), 'Jones Family', '555-0101', '', OCT_22]);
  return ctx;
}

test('the repair puts the roster names back on the calendar', () => {
  const ctx = brokenState();
  assert.match(String(fixtures.square(ctx, OCT_20)), /available/, 'setup: square is empty');

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family');
  assert.strictEqual(fixtures.square(ctx, OCT_22), '22\nJones Family');
  assert.strictEqual(fixtures.squareColor(ctx, OCT_20), '#93c47d');
});

test('the dry run reports the repair without doing it', () => {
  const ctx = brokenState();

  ctx.previewCalendarRepair();

  assert.match(String(fixtures.square(ctx, OCT_20)), /available/, 'must change nothing');
  const log = ctx.$.logs.join('\n');
  assert.match(log, /DRY RUN/);
  assert.match(log, /WOULD PUT BACK 2 sign-up\(s\)/);
  assert.ok(log.includes('Smith Family') && log.includes('Jones Family'));
});

test('the repair finds the columns from the headers, not by position', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_22] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  // An extra question added to the form shifts every later column
  roster.appendRow(['Timestamp', 'How many people?', 'Your name', 'Phone number', 'Choose a date']);
  roster.appendRow([new Date(), '4', 'Smith Family', '555-0100', OCT_20]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family',
    'the name must be read from the column its header names');
});

test('the repair leaves correct squares alone and is safe to re-run', () => {
  const ctx = brokenState();
  ctx.repairCalendar();
  const after20 = fixtures.square(ctx, OCT_20);

  ctx.$.logs.length = 0;
  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), after20);
  assert.match(ctx.$.logs.join('\n'), /Nothing to repair/);
});

test('a taken date still being offered is pulled off the form', () => {
  // A double booking waiting to happen
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20, OCT_22] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Smith Family', '555-0100', '', OCT_20]);

  ctx.repairCalendar();

  assert.ok(!fixtures.choices(ctx).includes(OCT_20),
    'a date somebody already has must not stay on the form');
  assert.ok(fixtures.choices(ctx).includes(OCT_22), 'other dates are untouched');
  assert.match(ctx.$.logs.join('\n'), /took 1 already-taken date\(s\) back off the form/);
});

test('a sign-up for a date not on the calendar is reported, not guessed at', () => {
  const ctx = fixtures.withSchedule({
    now: OCT_13, from: '2026-09-01', to: '2026-09-30', choices: []
  });
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Smith Family', '555-0100', '', OCT_20]);

  ctx.repairCalendar();

  const log = ctx.$.logs.join('\n');
  assert.match(log, /STILL BROKEN: 1 upcoming sign-up/);
  assert.match(log, /run extendSignupForm\(\) for that month/i);
});

test('a roster row whose name is blank too still marks the day taken', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), '', '555-0100', '', OCT_20]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\n(signed up)');
});

/* ---------- the repair must not reach into the past ---------- */

const PAST_OCT_6 = 'Tuesday, October 6, 2026';   // before the 13th
const PAST_OCT_8 = 'Thursday, October 8, 2026';

test('a day that has gone by is not restored to the calendar', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  // The nightly prune has greyed the 6th out, as it should have
  const ref = ctx.dateMap[PAST_OCT_6];
  ctx.sheet.getRange(ref.row, ref.col).setValue('6\n(past)').setBackground('#efefef');

  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Old Family', '555-0100', '', PAST_OCT_6]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, PAST_OCT_6), '6\n(past)',
    'a finished day must keep its "(past)" marking');
  assert.strictEqual(fixtures.squareColor(ctx, PAST_OCT_6), '#efefef',
    'and must not be turned green again');
  assert.match(ctx.$.logs.join('\n'), /Left alone: 1 sign-up\(s\) for days that have already gone by/);
});

test('today itself still counts as repairable', () => {
  // The clock is the 13th; a sign-up for the 13th is not "past"
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  const todayLabel = 'Tuesday, October 13, 2026';
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Tonight Family', '555-0100', '', todayLabel]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, todayLabel), '13\nTonight Family',
    "tonight's meal still needs to show on the calendar");
});

test('upcoming days are repaired while past ones are skipped in the same run', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Old Family', '555-0100', '', PAST_OCT_8]);
  roster.appendRow([new Date(), 'Smith Family', '555-0101', '', OCT_20]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family');
  assert.match(String(fixtures.square(ctx, PAST_OCT_8)), /available/,
    'the past square is left exactly as it was');
  assert.match(ctx.$.logs.join('\n'), /Repaired 1 calendar square/);
});

test('a removed month in the past is not reported as needing extendSignupForm', () => {
  // September was taken off the sheet with removeOldMonths(), so those
  // dates are not in SCHEDULE_MAP any more. Telling the user to add
  // the month back would be exactly the wrong advice.
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'September Family', '555-0100', '', 'Thursday, September 17, 2026']);

  ctx.repairCalendar();

  const log = ctx.$.logs.join('\n');
  assert.ok(!/STILL BROKEN/.test(log), 'a finished month is not broken, it is finished');
  assert.ok(!/extendSignupForm/.test(log));
  assert.match(log, /Left alone: 1 sign-up/);
});

test('an UPCOMING date missing from the calendar is still flagged', () => {
  // The one case that genuinely does need extendSignupForm()
  const ctx = fixtures.withSchedule({
    now: OCT_13, from: '2026-10-01', to: '2026-10-31', choices: []
  });
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'November Family', '555-0100', '', 'Tuesday, November 10, 2026']);

  ctx.repairCalendar();

  const log = ctx.$.logs.join('\n');
  assert.match(log, /STILL BROKEN: 1 upcoming sign-up/);
  assert.match(log, /extendSignupForm/);
});

test('the dry run reports the skipped past days too', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_20] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Your name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Old Family', '555-0100', '', PAST_OCT_6]);
  roster.appendRow([new Date(), 'Smith Family', '555-0101', '', OCT_20]);

  ctx.previewCalendarRepair();

  const log = ctx.$.logs.join('\n');
  assert.match(log, /Only looking at Tuesday, October 13, 2026 onward/);
  assert.match(log, /Skipped 1 sign-up\(s\) for days that have already gone by/);
  assert.match(log, /WOULD PUT BACK 1 sign-up/);
  assert.ok(!log.includes('Old Family'), 'a past sign-up should not be listed for repair');
});

/* ---------- things the live run on 13 October 2026 turned up ---------- */

test('a date cell stored as a real Date is still understood', () => {
  // Rows 63-74 of the live roster came back as Date objects, not the
  // label text, so they matched no calendar square and were wrongly
  // reported as needing extendSignupForm() — for August.
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_22] }));
  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Smith Family', '555-0100', '', new Date(2026, 9, 20)]); // Oct 20
  roster.appendRow([new Date(), 'Crandall', '555-0101', '', new Date(2026, 7, 29)]);     // past

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family',
    'a Date-valued cell must resolve to its calendar square');
  const log = ctx.$.logs.join('\n');
  assert.match(log, /Left alone: 1 sign-up\(s\) for days that have already gone by/);
  assert.ok(!/STILL BROKEN/.test(log),
    'a finished August date must not be reported as needing the month added back');
});

test('a square that already has a different name is never overwritten', () => {
  // The live case: calendar read "Joe porritt", roster said "Jo porritt".
  // Somebody had corrected the spelling by hand.
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_22] }));
  const ref = ctx.dateMap[OCT_20];
  ctx.sheet.getRange(ref.row, ref.col).setValue('20\nJoe porritt').setBackground('#93c47d');

  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Jo porritt', '555-0100', '', OCT_20]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nJoe porritt',
    'a hand-corrected name must survive the repair');
  const log = ctx.$.logs.join('\n');
  assert.match(log, /LEFT ALONE: 1 square/);
  assert.match(log, /calendar says "Joe porritt", roster row 2 says "Jo porritt"/);
});

test('a "(signed up)" square IS replaced once the real name is known', () => {
  // The opposite case: the placeholder is not a real name, so filling
  // it in from the roster is exactly what should happen.
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, { choices: [OCT_22] }));
  const ref = ctx.dateMap[OCT_20];
  ctx.sheet.getRange(ref.row, ref.col).setValue('20\n(signed up)').setBackground('#93c47d');

  const roster = ctx.responses.getSheetByName('Form Responses 1');
  roster.appendRow(['Timestamp', 'Name', 'Phone number', 'Email address', 'Choose a date']);
  roster.appendRow([new Date(), 'Smith Family', '555-0100', '', OCT_20]);

  ctx.repairCalendar();

  assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family');
});

test('every placeholder counts as an empty square', () => {
  const ctx = fixtures.withSchedule(OCT);
  ['14\n— available —', '14\n(past)', '14\n(signed up)', '14\n(no meal needed)', '14', '14\n  ']
    .forEach(text => assert.strictEqual(ctx.squareHasNoName(text), true, text));
  ['14\nSmith Family', '14\nJoe porritt']
    .forEach(text => assert.strictEqual(ctx.squareHasNoName(text), false, text));
});

test('the name is found when the question is titled just "Name"', () => {
  // What the live form actually had, and the reason every sign-up
  // came through blank.
  const ctx = fixtures.withSchedule(OCT);
  const responses = [{
    getItem: () => ({ getTitle: () => 'Name' }),
    getResponse: () => 'Kinikini'
  }];
  assert.strictEqual(ctx.findNameResponse(responses), 'Kinikini');
});
