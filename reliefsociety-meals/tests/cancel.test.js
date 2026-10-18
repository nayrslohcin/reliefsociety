'use strict';
/**
 * cancelSignup(), the script-editor way to reopen a date, and
 * releaseDate(), which it shares with the Quick Cancel tab.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, person, submit } = require('./fixtures');

const RANGE = { personName: 'Jane Doe', startDate: '2026-11-02', endDate: '2026-11-04' };

/** Jane Doe set up, with every date taken so the form has closed. */
function fullForm() {
  const ctx = load();
  const p = person(ctx, RANGE);
  ['2026-11-02', '2026-11-03', '2026-11-04'].forEach((iso, i) =>
    submit(ctx, p.form, { name: 'Family ' + (i + 1), date: p.label(iso) }));
  return { ctx, p };
}

test('reopening a date on a full form puts it back and opens the form again', () => {
  const { ctx, p } = fullForm();
  assert.strictEqual(p.form.isAcceptingResponses(), false);

  const run = ctx.rerun({ config: { PERSON_NAME: "'Jane Doe'", CANCEL_DATE: "'2026-11-03'" } });
  run.cancelSignup();

  assert.deepStrictEqual(p.form.choices(), [p.label('2026-11-03')], 'the "all filled" placeholder is gone');
  assert.strictEqual(p.form.isAcceptingResponses(), true);
  assert.strictEqual(p.square('2026-11-03'), '3\n— available —');
  assert.strictEqual(p.square('2026-11-02'), '2\nFamily 1', 'other sign-ups are untouched');
  assert.match(run.$.logs.join('\n'), /is available again/);
});

test('a date that has already passed is cleared but not reopened', () => {
  const { ctx, p } = fullForm();
  const later = ctx.rerun({
    now: new Date(2026, 10, 5),
    config: { PERSON_NAME: "'Jane Doe'", CANCEL_DATE: "'2026-11-03'" }
  });

  later.cancelSignup();

  assert.strictEqual(p.square('2026-11-03'), '3\n(past)');
  assert.deepStrictEqual(p.form.choices(), ['(All dates are filled)']);
  assert.match(later.$.logs.join('\n'), /not reopened — .* has already passed/);
});

test('cancelSignup: explains each setting mistake', () => {
  const { ctx } = fullForm();
  assert.throws(() => ctx.rerun({ config: { PERSON_NAME: "'Jane Doe'" } }).cancelSignup(),
    /Set CANCEL_DATE above/);
  assert.throws(() => ctx.rerun({ config: { PERSON_NAME: "'Jane Do'", CANCEL_DATE: "'2026-11-03'" } }).cancelSignup(),
    /No existing form found for "Jane Do"/);
  assert.throws(() => ctx.rerun({ config: { PERSON_NAME: "'Jane Doe'", CANCEL_DATE: "'2026-12-03'" } }).cancelSignup(),
    /Could not find 2026-12-03 on Jane Doe's schedule/);
});

test('cancelling for one person never touches another person with the same date', () => {
  const { ctx, p } = fullForm();
  const other = person(ctx, Object.assign({}, RANGE, { personName: 'The Smiths' }));
  submit(ctx, other.form, { name: 'Helper Family', date: other.label('2026-11-03') });

  ctx.rerun({ config: { PERSON_NAME: "'Jane Doe'", CANCEL_DATE: "'2026-11-03'" } }).cancelSignup();

  assert.strictEqual(p.square('2026-11-03'), '3\n— available —');
  assert.strictEqual(other.square('2026-11-03'), '3\nHelper Family');
  assert.ok(!other.form.choices().includes(other.label('2026-11-03')));
});

test('releaseDate: reports a missing schedule record instead of failing', () => {
  const { ctx, p } = fullForm();
  delete ctx.$.properties['p:jane-doe:SCHEDULE_MAP'];
  const props = ctx.PropertiesService.getScriptProperties();
  assert.match(ctx.releaseDate(props, 'jane-doe', p.form, 'Tuesday, November 3, 2026'), /SCHEDULE_MAP not set/);
});

test('releaseDate: a label not on the schedule is reported, and nothing changes', () => {
  const { ctx, p } = fullForm();
  const props = ctx.PropertiesService.getScriptProperties();
  assert.match(ctx.releaseDate(props, 'jane-doe', p.form, 'Friday, December 25, 2026'), /Could not find/);
  assert.deepStrictEqual(p.form.choices(), ['(All dates are filled)']);
});
