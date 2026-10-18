'use strict';
/**
 * extendSignupForm(): opening more days for someone who already has a
 * form, keeping the same links.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, handles, submit } = require('./fixtures');

const JANE = { PERSON_NAME: "'Jane Doe'", START_DATE: "'2026-11-02'", END_DATE: "'2026-11-08'" };

/** Jane Doe set up for Nov 2-8 through createSignupForm(). */
function setUp() {
  const ctx = load(JANE);
  ctx.createSignupForm();
  return { ctx, p: handles(ctx, 'Jane Doe') };
}

test('adds a new month to the same form and draws it below the first', () => {
  const { ctx, p } = setUp();
  const formId = p.form.getId();
  const rowsBefore = p.sheet.getLastRow();

  ctx.rerun({ config: { START_DATE: "'2026-12-01'", END_DATE: "'2026-12-03'" } }).extendSignupForm();

  assert.strictEqual(handles(ctx, 'Jane Doe').form.getId(), formId, 'same form, so the shared link still works');
  assert.strictEqual(p.form.choices().length, 10, '7 November days + 3 December days');
  assert.strictEqual(p.form.choices()[9], 'Thursday, December 3, 2026');
  assert.strictEqual(p.sheet.getRange(rowsBefore + 2, 1).getValue(), 'December 2026');
  assert.strictEqual(p.square('2026-12-01'), '1\n— available —');
  assert.deepStrictEqual(JSON.parse(p.prop('ADDED_MONTHS')), ['2026-11', '2026-12']);
});

test('keeps existing sign-ups and only adds the new dates', () => {
  const { ctx, p } = setUp();
  submit(ctx, p.form, { name: 'Smith Family', date: p.label('2026-11-03') });

  ctx.rerun({ config: { START_DATE: "'2026-11-02'", END_DATE: "'2026-12-02'" } }).extendSignupForm();

  assert.ok(!p.form.choices().includes(p.label('2026-11-03')), 'a taken date is not reopened');
  assert.strictEqual(p.square('2026-11-03'), '3\nSmith Family');
  assert.ok(p.form.choices().includes('Wednesday, December 2, 2026'));
});

test('reopens a form that had filled up', () => {
  const { ctx, p } = setUp();
  for (const iso of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    submit(ctx, p.form, { name: 'Family ' + iso, date: p.label(iso) });
  }
  assert.strictEqual(p.form.isAcceptingResponses(), false);

  ctx.rerun({ config: { START_DATE: "'2026-12-01'", END_DATE: "'2026-12-01'" } }).extendSignupForm();

  assert.strictEqual(p.form.isAcceptingResponses(), true);
  assert.deepStrictEqual(p.form.choices(), ['Tuesday, December 1, 2026'], 'the "all filled" placeholder is gone');
});

test('drops dates that have passed, and greys them out on the schedule', () => {
  const { ctx, p } = setUp();
  const later = ctx.rerun({ now: new Date(2026, 10, 5), config: { START_DATE: "'2026-12-01'", END_DATE: "'2026-12-01'" } });

  later.extendSignupForm();

  assert.strictEqual(p.form.choices()[0], 'Thursday, November 5, 2026');
  assert.strictEqual(p.square('2026-11-04'), '4\n(past)');
});

test('running it again with the same dates changes nothing', () => {
  const { ctx, p } = setUp();
  const run = ctx.rerun({ config: { START_DATE: "'2026-12-01'", END_DATE: "'2026-12-03'" } });
  run.extendSignupForm();
  const rows = p.sheet.getLastRow();
  const choices = p.form.choices();

  run.$.logs.length = 0;
  run.extendSignupForm();

  assert.strictEqual(p.sheet.getLastRow(), rows, 'no second December block');
  assert.deepStrictEqual(p.form.choices(), choices);
  assert.match(run.$.logs.join('\n'), /Nothing to do/);
});

test('fails clearly for someone who was never set up', () => {
  const { ctx } = setUp();
  assert.throws(() => ctx.rerun({ config: { PERSON_NAME: "'Jane Smith'" } }).extendSignupForm(),
    /No existing form found for "Jane Smith" — run createSignupForm\(\) first/);
});

test('adds more days in a month that is already on the schedule',
  { todo: 'extendSignupForm() skips any month already drawn, so extending Nov 2-8 to Nov 15 does nothing' },
  () => {
    const { ctx, p } = setUp();
    ctx.rerun({ config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-15'" } }).extendSignupForm();
    assert.ok(p.form.choices().includes('Monday, November 9, 2026'));
    assert.strictEqual(p.square('2026-11-09'), '9\n— available —');
  });
