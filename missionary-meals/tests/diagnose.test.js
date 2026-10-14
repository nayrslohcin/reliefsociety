'use strict';
/**
 * diagnoseSignups() exists to answer one live question: people signed
 * up, the rows are in Form Responses 1, and nothing appeared on the
 * calendar — why? It must identify the cause and change nothing.
 */

const test = require('node:test');
const assert = require('node:assert');

const harness = require('./harness');
const fixtures = require('./fixtures');

const OCT_13 = new Date(2026, 9, 13, 10, 0);
const OCT = { now: OCT_13, from: '2026-10-01', to: '2026-10-31' };
const OCT_20 = 'Tuesday, October 20, 2026';

const ALL_TRIGGERS = ['onSignup', 'onResponsesEdit', 'checkSundaySchedule', 'pruneOldDates'];

function roster(ctx, rows) {
  const sheet = ctx.responses.getSheetByName('Form Responses 1');
  sheet.appendRow(['Timestamp', 'Name', 'Phone', 'Email', 'Date']);
  rows.forEach(r => sheet.appendRow([new Date(), r.name, r.phone || '', '', r.date]));
  return sheet;
}

test('it names a date that is offered but not on the calendar', () => {
  // A month opened up by hand-editing the Google Form: the date is
  // selectable but was never drawn, so it is not in SCHEDULE_MAP.
  const ctx = fixtures.withSchedule({
    now: OCT_13, from: '2026-09-01', to: '2026-09-30',
    choices: ['Tuesday, October 20, 2026', 'Thursday, October 22, 2026'],
    triggers: ALL_TRIGGERS
  });
  roster(ctx, [{ name: 'Smith Family', date: 'Tuesday, October 20, 2026' }]);

  ctx.diagnoseSignups();
  const log = ctx.$.logs.join('\n');

  assert.match(log, /NOT ON THE CALENDAR: "Tuesday, October 20, 2026"/);
  assert.match(log, /2 date\(s\) are offered on the form but are NOT in SCHEDULE_MAP/);
  assert.match(log, /Smith Family -> "Tuesday, October 20, 2026"  NOT IN SCHEDULE_MAP/);
});

test('it calls out a missing onSignup trigger', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, {
    choices: [OCT_20],
    triggers: ['onResponsesEdit', 'checkSundaySchedule', 'pruneOldDates']
  }));

  ctx.diagnoseSignups();

  assert.match(ctx.$.logs.join('\n'), /onSignup IS MISSING\. Nothing runs when somebody signs up/);
});

test('it calls out a renamed Schedule tab', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, {
    choices: [OCT_20], triggers: ALL_TRIGGERS
  }));
  ctx.sheet.setName('Schedule (old)');

  ctx.diagnoseSignups();

  assert.match(ctx.$.logs.join('\n'), /no tab named exactly "Schedule"/);
});

test('it reports a healthy setup as healthy', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, {
    choices: [OCT_20], triggers: ALL_TRIGGERS
  }));
  assert.strictEqual(ctx.claimDate(ctx.$.form, OCT_20, 'Smith Family', ''), null);
  roster(ctx, [{ name: 'Smith Family', date: OCT_20 }]);

  ctx.diagnoseSignups();
  const log = ctx.$.logs.join('\n');

  assert.match(log, /All offered dates are on the calendar/);
  assert.match(log, /Smith Family -> Tuesday, October 20, 2026.*OK/);
  assert.ok(!/IS MISSING/.test(log));
});

test('it spots a sign-up whose name never made it onto the calendar', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, {
    choices: [OCT_20], triggers: ALL_TRIGGERS
  }));
  // The date is on the calendar, but nothing ever wrote the name —
  // exactly what a dead onSignup trigger leaves behind.
  roster(ctx, [{ name: 'Smith Family', date: OCT_20 }]);

  ctx.diagnoseSignups();

  assert.match(ctx.$.logs.join('\n'), /Smith Family -> Tuesday, October 20, 2026.*name is NOT there/);
});

test('it survives a project with nothing set up', () => {
  const ctx = harness.load({ now: OCT_13, properties: {} });
  ctx.diagnoseSignups();
  assert.match(ctx.$.logs.join('\n'), /not attached to a form/);
});

test('it changes absolutely nothing', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, OCT, {
    choices: [OCT_20, 'Thursday, October 22, 2026'], triggers: ALL_TRIGGERS
  }));
  roster(ctx, [{ name: 'Smith Family', date: OCT_20 }]);

  const before = {
    choices: fixtures.choices(ctx),
    accepting: ctx.$.form.isAcceptingResponses(),
    square: fixtures.square(ctx, OCT_20),
    map: ctx.$.properties.SCHEDULE_MAP,
    triggers: ctx.$.triggers.length,
    mail: ctx.$.sentMail.length
  };

  ctx.diagnoseSignups();

  assert.deepStrictEqual(fixtures.choices(ctx), before.choices);
  assert.strictEqual(ctx.$.form.isAcceptingResponses(), before.accepting);
  assert.strictEqual(fixtures.square(ctx, OCT_20), before.square);
  assert.strictEqual(ctx.$.properties.SCHEDULE_MAP, before.map);
  assert.strictEqual(ctx.$.triggers.length, before.triggers);
  assert.strictEqual(ctx.$.sentMail.length, before.mail, 'and it must not email anyone');
});
