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

test('adds more days in a month that is already on the schedule, in place', () => {
  const { ctx, p } = setUp();
  const rows = p.sheet.getLastRow();
  // Before: Nov 9 has a greyed-out square, outside the original range
  assert.strictEqual(p.sheet.getRange(4, 2).getValue(), '9');

  const run = ctx.rerun({ config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-15'" } });
  run.extendSignupForm();

  assert.strictEqual(p.sheet.getLastRow(), rows, 'no second November block');
  assert.strictEqual(p.square('2026-11-09'), '9\n— available —');
  assert.deepStrictEqual({ ...p.map[p.label('2026-11-09')] }, { row: 4, col: 2, iso: '2026-11-09' },
    'the new day points at the square it already had');
  assert.strictEqual(p.sheet.getRange(4, 2).getBackground(), '#ffffff');
  assert.strictEqual(p.form.choices().length, 14);
  assert.strictEqual(p.form.choices()[13], 'Sunday, November 15, 2026');
  assert.deepStrictEqual(JSON.parse(p.prop('ADDED_MONTHS')), ['2026-11']);
  assert.match(run.$.logs.join('\n'), /Added for Jane Doe: November 2026 \(7 more days\)/);
});

test('a volunteer can sign up for an added day, and it lands in the right square', () => {
  const { ctx, p } = setUp();
  ctx.rerun({ config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-15'" } }).extendSignupForm();

  submit(ctx, p.form, { name: 'Smith Family', date: p.label('2026-11-12') });

  assert.strictEqual(p.square('2026-11-12'), '12\nSmith Family');
  assert.strictEqual(p.sheet.getRange(4, 5).getValue(), '12\nSmith Family', 'Thursday of the second week');
});

test('days added earlier in the month go into the dropdown in date order', () => {
  const ctx = load(Object.assign({}, JANE, { START_DATE: "'2026-11-16'", END_DATE: "'2026-11-18'" }));
  ctx.createSignupForm();
  const p = handles(ctx, 'Jane Doe');

  ctx.rerun({ config: { START_DATE: "'2026-11-02'", END_DATE: "'2026-11-03'" } }).extendSignupForm();

  assert.deepStrictEqual(p.form.choices(), [
    'Monday, November 2, 2026', 'Tuesday, November 3, 2026',
    'Monday, November 16, 2026', 'Tuesday, November 17, 2026', 'Wednesday, November 18, 2026'
  ]);
});

test('an overlapping range only adds the days that are new', () => {
  const { ctx, p } = setUp();
  submit(ctx, p.form, { name: 'Smith Family', date: p.label('2026-11-03') });

  ctx.rerun({ config: { START_DATE: "'2026-11-01'", END_DATE: "'2026-11-10'" } }).extendSignupForm();

  assert.strictEqual(p.square('2026-11-03'), '3\nSmith Family', 'a signed-up day is left alone');
  assert.ok(!p.form.choices().includes(p.label('2026-11-03')), 'and not reopened');
  assert.strictEqual(p.square('2026-11-01'), '1\n— available —');
  assert.strictEqual(p.square('2026-11-10'), '10\n— available —');
  assert.strictEqual(p.form.choices().length, 9, 'Nov 1-10, minus the one taken');
});

test('a day excluded at setup can be opened later', () => {
  const ctx = load(Object.assign({}, JANE, { EXCLUDE_DATES: "['2026-11-04']" }));
  ctx.createSignupForm();
  const p = handles(ctx, 'Jane Doe');
  assert.strictEqual(p.sheet.getRange(3, 4).getValue(), '4\n(not needed)');

  ctx.rerun({ config: { START_DATE: "'2026-11-04'", END_DATE: "'2026-11-04'", EXCLUDE_DATES: '[]' } }).extendSignupForm();

  assert.strictEqual(p.square('2026-11-04'), '4\n— available —');
  assert.ok(p.form.choices().includes('Wednesday, November 4, 2026'));
});

test('excluded days in the new range stay off', () => {
  const { ctx, p } = setUp();
  ctx.rerun({
    config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-11'", EXCLUDE_DATES: "['2026-11-10']" }
  }).extendSignupForm();

  assert.ok(!p.form.choices().includes('Tuesday, November 10, 2026'));
  assert.strictEqual(p.sheet.getRange(4, 3).getValue(), '10', 'its square is untouched');
});

test('one run can add days to this month and draw a new month', () => {
  const { ctx, p } = setUp();
  const run = ctx.rerun({ config: { START_DATE: "'2026-11-28'", END_DATE: "'2026-12-02'" } });
  run.extendSignupForm();

  assert.strictEqual(p.square('2026-11-28'), '28\n— available —');
  assert.strictEqual(p.square('2026-12-01'), '1\n— available —');
  assert.strictEqual(p.form.choices().length, 7 + 5);
  assert.deepStrictEqual(JSON.parse(p.prop('ADDED_MONTHS')), ['2026-11', '2026-12']);
  assert.match(run.$.logs.join('\n'), /November 2026 \(3 more days\), December 2026/);
});

test('adding days in the current month reopens a full form', () => {
  const { ctx, p } = setUp();
  for (const iso of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    submit(ctx, p.form, { name: 'Family ' + iso, date: p.label(iso) });
  }

  ctx.rerun({ config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-09'" } }).extendSignupForm();

  assert.strictEqual(p.form.isAcceptingResponses(), true);
  assert.deepStrictEqual(p.form.choices(), ['Monday, November 9, 2026']);
});

test('new days that have already passed are not added', () => {
  const { ctx, p } = setUp();
  const later = ctx.rerun({
    now: new Date(2026, 10, 20),
    config: { START_DATE: "'2026-11-16'", END_DATE: "'2026-11-22'" }
  });

  later.extendSignupForm();

  assert.deepStrictEqual(p.form.choices(), [
    'Friday, November 20, 2026', 'Saturday, November 21, 2026', 'Sunday, November 22, 2026'
  ]);
  assert.strictEqual(p.sheet.getRange(5, 2).getValue(), '16', 'Nov 16 left as it was');
});

test('a range that is entirely in the past does nothing', () => {
  const { ctx, p } = setUp();
  const later = ctx.rerun({
    now: new Date(2026, 10, 20),
    config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-15'" }
  });
  const choices = p.form.choices();

  later.extendSignupForm();

  assert.match(later.$.logs.join('\n'), /Nothing to do/);
  assert.deepStrictEqual(p.form.choices(), choices);
});

test('if the month\'s heading was deleted from the schedule, its days are skipped with a note', () => {
  const { ctx, p } = setUp();
  p.sheet.getRange(1, 1).setValue('');
  const run = ctx.rerun({ config: { START_DATE: "'2026-11-09'", END_DATE: "'2026-11-10'" } });

  run.extendSignupForm();

  assert.match(run.$.logs.join('\n'), /Could not find the "November 2026" heading/);
  assert.ok(!p.form.choices().includes('Monday, November 9, 2026'));
});

test('a later month block is found by its own heading', () => {
  // December is drawn below November; its squares must be found from
  // the December heading, not counted from the top of the sheet
  const { ctx, p } = setUp();
  ctx.rerun({ config: { START_DATE: "'2026-12-01'", END_DATE: "'2026-12-01'" } }).extendSignupForm();

  ctx.rerun({ config: { START_DATE: "'2026-12-10'", END_DATE: "'2026-12-10'" } }).extendSignupForm();

  const ref = p.map[p.label('2026-12-10')];
  const decTitle = p.map[p.label('2026-12-01')].row - 2;
  assert.strictEqual(p.sheet.getRange(decTitle, 1).getValue(), 'December 2026');
  assert.deepStrictEqual({ ...ref }, { row: decTitle + 3, col: 5, iso: '2026-12-10' });
  assert.strictEqual(p.square('2026-12-10'), '10\n— available —');
});
