'use strict';
/**
 * healthCheck() and exportScriptProperties() are the two things
 * DEPLOY.md tells you to run by hand, so they need to work on a
 * half-configured project too — including one where createSignupForm()
 * has never run.
 */

const test = require('node:test');
const assert = require('node:assert');

const harness = require('./harness');
const fixtures = require('./fixtures');

const SEPT_22 = new Date(2026, 8, 22, 20, 0);
const SEPT = { now: SEPT_22, from: '2026-09-01', to: '2026-09-30' };

test('healthCheck reports the wiring without changing anything', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: ['Thursday, September 24, 2026', 'Saturday, September 26, 2026'],
    triggers: ['onSignup', 'onResponsesEdit', 'checkSundaySchedule', 'pruneOldDates']
  }));
  const before = fixtures.choices(ctx);

  ctx.healthCheck();

  const log = ctx.$.logs.join('\n');
  assert.match(log, /Script version: /);
  assert.match(log, /Time zone: America\/Chicago/);
  assert.match(log, /Form is OPEN/);
  assert.match(log, /Open dates: 2/);
  assert.match(log, /Triggers \(4\)/);
  assert.ok(!/MISSING/.test(log), 'nothing should be reported missing');

  assert.deepStrictEqual(fixtures.choices(ctx), before, 'healthCheck must not change the form');
});

test('healthCheck names a missing trigger', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: ['Thursday, September 24, 2026'],
    triggers: ['onResponsesEdit', 'checkSundaySchedule', 'pruneOldDates']
  }));

  ctx.healthCheck();

  assert.match(ctx.$.logs.join('\n'), /MISSING: onSignup/,
    'a lost sign-up trigger is the quietest way for this to break');
});

test('healthCheck flags past dates still sitting on the dropdown', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: ['Thursday, September 17, 2026', 'Thursday, September 24, 2026']
  }));

  ctx.healthCheck();

  assert.match(ctx.$.logs.join('\n'), /Past dates still on the dropdown: 1/);
});

test('healthCheck copes with a project where nothing has been created yet', () => {
  const ctx = harness.load({ now: SEPT_22, properties: {} });

  ctx.healthCheck();

  assert.match(ctx.$.logs.join('\n'), /NO FORM YET/);
});

test('healthCheck reports a closed form and its message', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: ['(All dates are filled)'],
    accepting: false,
    closedMessage: 'All dates are filled — thank you so much!'
  }));

  ctx.healthCheck();

  const log = ctx.$.logs.join('\n');
  assert.match(log, /Form is CLOSED/);
  assert.match(log, /All dates are filled/);
  assert.match(log, /Open dates: 0/);
});

test('exportScriptProperties dumps the schedule map', () => {
  const ctx = fixtures.withSchedule(Object.assign({}, SEPT, {
    choices: ['Thursday, September 24, 2026']
  }));

  ctx.exportScriptProperties();

  const log = ctx.$.logs.join('\n');
  assert.match(log, /SCRIPT PROPERTIES BACKUP/);
  assert.match(log, /SCHEDULE_MAP = \{/);
  assert.match(log, /FORM_ID = /);
  assert.match(log, /ADDED_MONTHS = /);
});
