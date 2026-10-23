'use strict';
/**
 * A sign-up whose phone number ended in "=" (e.g. "555-0100=") was
 * reported to land in the responses sheet and come off the form, but
 * never reach the calendar. These tests drive both sign-up paths with
 * such a phone number end to end.
 */

const test = require('node:test');
const assert = require('node:assert');

const fixtures = require('./fixtures');

const OCT_13 = new Date(2026, 9, 13, 10, 0);
const OCT = { now: OCT_13, from: '2026-10-01', to: '2026-10-31' };
const OCT_20 = 'Tuesday, October 20, 2026';

/** A fake form-submit event carrying the given answers. */
function submitEvent(ctx, answers) {
  const item = (id, title) => ({ getId: () => id, getTitle: () => title });
  const responses = [
    { getItem: () => item('text-name', ctx.CONST.Q_NAME), getResponse: () => answers.name },
    { getItem: () => item('text-phone', ctx.CONST.Q_PHONE), getResponse: () => answers.phone },
    { getItem: () => item('text-email', ctx.CONST.Q_EMAIL), getResponse: () => answers.email },
    { getItem: () => item(ctx.$.form.listItem.getId(), 'Choose a date'), getResponse: () => answers.date }
  ];
  return { source: ctx.$.form, response: { getItemResponses: () => responses } };
}

['555-0100=', '=', '==', '=555-0100', '555-0100 ='].forEach(phone => {
  test('a form sign-up with phone ' + JSON.stringify(phone) + ' reaches the calendar', () => {
    const ctx = fixtures.withSchedule(OCT);

    ctx.onSignup(submitEvent(ctx, { name: 'Smith Family', phone: phone, email: '', date: OCT_20 }));

    assert.deepStrictEqual(ctx.$.logs.filter(l => l.startsWith('ERROR')), []);
    assert.ok(!fixtures.choices(ctx).includes(OCT_20), 'date comes off the form');
    assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family');
    assert.strictEqual(fixtures.squareColor(ctx, OCT_20), '#93c47d');
  });

  test('a Quick Add sign-up with phone ' + JSON.stringify(phone) + ' reaches the calendar', () => {
    const ctx = fixtures.withSchedule(OCT);
    const quickAdd = ctx.responses.insertSheet('Quick Add');
    quickAdd.getRange(2, 1, 1, 4).setValues([['Smith Family', phone, '', '2026-10-20']]);

    ctx.onResponsesEdit({ range: quickAdd.getRange(2, 1, 1, 4) });

    assert.strictEqual(quickAdd.getRange(2, 5).getValue(), 'Done');
    assert.ok(!fixtures.choices(ctx).includes(OCT_20));
    assert.strictEqual(fixtures.square(ctx, OCT_20), '20\nSmith Family');
  });
});
