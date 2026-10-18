'use strict';
/**
 * Many people in one project: each person's sign-up is kept separate,
 * listPeople() finds everyone, and forgetPerson() lets one go.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, person, handles, submit, typeRow, triggers } = require('./fixtures');

const RANGE = { startDate: '2026-11-02', endDate: '2026-11-04' };

/** Jane Doe and The Smiths, both set up for the same three days. */
function twoPeople() {
  const ctx = load();
  const jane = person(ctx, Object.assign({ personName: 'Jane Doe' }, RANGE));
  const smiths = person(ctx, Object.assign({ personName: 'The Smiths' }, RANGE));
  return { ctx, jane, smiths };
}

test('a sign-up on one person\'s form never touches another\'s', () => {
  const { ctx, jane, smiths } = twoPeople();

  submit(ctx, jane.form, { name: 'Helper Family', email: 'h@example.test', date: jane.label('2026-11-03') });

  assert.strictEqual(jane.square('2026-11-03'), '3\nHelper Family');
  assert.strictEqual(smiths.square('2026-11-03'), '3\n— available —');
  assert.strictEqual(smiths.form.choices().length, 3);
  assert.match(ctx.$.sentMail[0].subject, /for Jane Doe/);
});

test('Quick Add on one person\'s sheet only claims on their form', () => {
  const { ctx, jane, smiths } = twoPeople();
  typeRow(ctx, smiths.responses, 'Quick Add', 2, ['Helper Family', '', '', '2026-11-03']);
  assert.strictEqual(smiths.square('2026-11-03'), '3\nHelper Family');
  assert.strictEqual(jane.form.choices().length, 3);
});

test('listPeople: logs each person\'s sign-up and schedule links', () => {
  const { ctx, jane, smiths } = twoPeople();
  ctx.listPeople();
  const log = ctx.$.logs.join('\n');
  for (const p of [jane, smiths]) {
    assert.ok(log.includes(p.form.getPublishedUrl()));
    assert.ok(log.includes(p.schedule.getUrl()));
  }
  assert.match(log, /Jane Doe\n {2}Sign-up:/);
});

test('listPeople: says so when nobody is set up', () => {
  const ctx = load();
  ctx.listPeople();
  assert.match(ctx.$.logs[0], /No one has been set up yet/);
});

test('listPeople: one person\'s deleted form doesn\'t hide everyone else', () => {
  const { ctx, jane, smiths } = twoPeople();
  ctx.$.drive.deleteFile(jane.form.getId());

  assert.doesNotThrow(() => ctx.listPeople());
  const log = ctx.$.logs.join('\n');
  assert.match(log, /Jane Doe\n {2}Sign-up: {2}\(deleted from Drive\)/);
  assert.ok(log.includes(smiths.form.getPublishedUrl()));
});

test('forgetPerson: removes only that person\'s records and triggers', () => {
  const { ctx, jane, smiths } = twoPeople();
  ctx.createAdminSetupForm();

  ctx.rerun({ config: { PERSON_NAME: "'Jane Doe'" } }).forgetPerson();

  assert.deepStrictEqual(triggers(ctx).map(t => t.sourceId).sort(),
    [ctx.$.properties.ADMIN_RESPONSES_ID, smiths.form.getId(), smiths.responses.getId()].sort());
  assert.ok(!Object.keys(ctx.$.properties).some(k => k.startsWith('p:jane-doe:')));
  assert.strictEqual(ctx.$.properties['formId:' + jane.form.getId()], undefined);
  assert.strictEqual(ctx.$.properties['ssId:' + jane.responses.getId()], undefined);
  assert.deepStrictEqual(JSON.parse(ctx.$.properties.PEOPLE).map(p => p.name), ['The Smiths']);
  assert.ok(ctx.$.drive.forms.has(jane.form.getId()), 'Drive files are left alone');
  assert.strictEqual(handles(ctx, 'The Smiths').form, smiths.form);
});

test('forgetPerson: a name that isn\'t set up changes nothing', () => {
  const { ctx } = twoPeople();
  const before = JSON.stringify(ctx.$.properties);
  const run = ctx.rerun({ config: { PERSON_NAME: "'Jane Do'" } });

  run.forgetPerson();

  assert.match(run.$.logs.pop(), /No one called "Jane Do" is set up/);
  assert.strictEqual(JSON.stringify(ctx.$.properties), before);
  assert.strictEqual(ctx.$.triggers.length, 4);
});

test('forgetPerson frees room for a new person when the project is full', () => {
  const ctx = load();
  for (let i = 1; i <= 10; i++) person(ctx, Object.assign({ personName: 'Family ' + i }, RANGE));
  assert.throws(() => person(ctx, Object.assign({ personName: 'Family 11' }, RANGE)), /as many sign-ups/);

  ctx.rerun({ config: { PERSON_NAME: "'Family 1'" } }).forgetPerson();

  assert.doesNotThrow(() => person(ctx, Object.assign({ personName: 'Family 11' }, RANGE)));
  assert.strictEqual(ctx.$.triggers.length, 20);
});

test('after forgetPerson, the same name can be set up again from scratch', () => {
  const { ctx, jane } = twoPeople();
  ctx.rerun({ config: { PERSON_NAME: "'Jane Doe'" } }).forgetPerson();

  const again = person(ctx, Object.assign({ personName: 'Jane Doe' }, RANGE));

  assert.notStrictEqual(again.form.getId(), jane.form.getId());
  assert.strictEqual(again.form.choices().length, 3);
});
