'use strict';
/**
 * A volunteer submits the form: onSignup() finds whose form it is, and
 * claimDate() takes the date off the dropdown, writes the name on the
 * schedule and emails a confirmation.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, person, submit } = require('./fixtures');
const { GREEN } = require('./apps-script-fakes');

const RANGE = { startDate: '2026-11-02', endDate: '2026-11-04' };

test('a sign-up writes the name, colours the square green and removes the date', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const date = p.label('2026-11-03');

  submit(ctx, p.form, { name: 'Smith Family', email: 'smith@example.test', date });

  assert.strictEqual(p.square('2026-11-03'), '3\nSmith Family');
  assert.strictEqual(p.squareColor('2026-11-03'), GREEN);
  assert.deepStrictEqual(p.form.choices(), [p.label('2026-11-02'), p.label('2026-11-04')]);
  assert.ok(p.form.isAcceptingResponses());
  assert.deepStrictEqual(ctx.$.errors, []);
});

test('taking the last date closes the form and points people to the schedule', () => {
  const ctx = load();
  const p = person(ctx, { startDate: '2026-11-02', endDate: '2026-11-02' });

  submit(ctx, p.form, { name: 'Smith Family', date: p.label('2026-11-02') });

  assert.deepStrictEqual(p.form.choices(), ['(All dates are filled)']);
  assert.strictEqual(p.form.isAcceptingResponses(), false);
  assert.match(p.form.getCustomClosedFormMessage(), /All dates are filled/);
  assert.ok(p.form.getCustomClosedFormMessage().endsWith(p.schedule.getUrl()));
  assert.strictEqual(p.square('2026-11-02'), '2\nSmith Family', 'the last sign-up still lands on the schedule');
});

test('a date that was already taken is refused and the first name stays', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const date = p.label('2026-11-03');
  submit(ctx, p.form, { name: 'First Family', date });

  const error = ctx.claimDate(ctx.PropertiesService.getScriptProperties(), p.key, p.form, date, 'Second Family', '');

  assert.match(error, /not an open date/);
  assert.strictEqual(p.square('2026-11-03'), '3\nFirst Family');
  assert.strictEqual(ctx.$.sentMail.length, 0);
});

test('a confirmation email with a calendar invite goes to the volunteer', () => {
  const ctx = load({ MEAL_TIME: "'17:30'", MEAL_LOCATION: "'123 Main St, Plano'" });
  const p = person(ctx, RANGE);

  submit(ctx, p.form, { name: 'Smith Family', email: 'smith@example.test', date: p.label('2026-11-03') });

  assert.strictEqual(ctx.$.sentMail.length, 1);
  const mail = ctx.$.sentMail[0];
  assert.strictEqual(mail.to, 'smith@example.test');
  assert.strictEqual(mail.subject, 'You\'re signed up to bring a meal for Jane Doe — Tuesday, November 3, 2026');
  assert.match(mail.body, /^Hi Smith Family,/);
  assert.strictEqual(mail.name, p.form.getTitle(), 'sent under the form\'s title');

  const [invite] = mail.attachments;
  assert.strictEqual(invite.name, 'meal-invite.ics');
  // 5:30 PM Central on Nov 3 (standard time, UTC-6) is 23:30 UTC
  assert.match(invite.content, /\r\nDTSTART:20261103T233000Z\r\n/);
  assert.match(invite.content, /\r\nDTEND:20261104T003000Z\r\n/, 'one hour long by default');
  assert.match(invite.content, /\r\nSUMMARY:Meal for Jane Doe\r\n/);
  assert.match(invite.content, /\r\nLOCATION:123 Main St\\, Plano\r\n/);
});

test('the calendar invite has no location line when MEAL_LOCATION is blank', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  submit(ctx, p.form, { name: 'Smith Family', email: 'smith@example.test', date: p.label('2026-11-03') });
  assert.doesNotMatch(ctx.$.sentMail[0].attachments[0].content, /LOCATION:/);
});

test('the invite time follows daylight saving time', () => {
  const ctx = load({}, new Date(2026, 9, 1));
  const p = person(ctx, { startDate: '2026-10-29', endDate: '2026-10-29' });
  submit(ctx, p.form, { name: 'Smith Family', email: 'smith@example.test', date: p.label('2026-10-29') });
  // 5:00 PM Central in October (daylight time, UTC-5) is 22:00 UTC
  assert.match(ctx.$.sentMail[0].attachments[0].content, /DTSTART:20261029T220000Z/);
});

test('a failed email is logged and the sign-up still counts', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  ctx.MailApp.sendEmail = () => { throw new Error('Service invoked too many times'); };

  submit(ctx, p.form, { name: 'Smith Family', email: 'smith@example.test', date: p.label('2026-11-03') });

  assert.strictEqual(p.square('2026-11-03'), '3\nSmith Family');
  assert.match(ctx.$.errors.join('\n'), /Failed to email smith@example.test/);
});

test('a form the script doesn\'t know about is ignored', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const stranger = ctx.FormApp.create('Someone else\'s form');

  submit(ctx, stranger, { name: 'Smith Family', date: p.label('2026-11-03') });

  assert.match(ctx.$.errors[0], /does not recognize/);
  assert.strictEqual(p.form.choices().length, 3);
});

test('a sign-up with a blank name keeps the calendar and dropdown in step', () => {
  // The name question is required, but if it was renamed in the Forms
  // editor the script finds no answer for it. Writing an empty name used
  // to throw part-way: the date left the dropdown but never reached the
  // schedule, so it was lost to everyone.
  const ctx = load();
  const p = person(ctx, RANGE);
  p.form.getItems()[0].setTitle('Name (renamed)');
  const date = p.label('2026-11-03');

  assert.doesNotThrow(() => submit(ctx, p.form, { name: 'Smith Family', date }));

  assert.ok(!p.form.choices().includes(date));
  assert.strictEqual(p.square('2026-11-03'), '3\n(signed up)', 'the day still shows as taken');
  assert.strictEqual(p.squareColor('2026-11-03'), GREEN);
});

test('a blank or space-only email address sends nothing', () => {
  const ctx = load();
  const p = person(ctx, RANGE);
  const props = ctx.PropertiesService.getScriptProperties();

  ctx.claimDate(props, p.key, p.form, p.label('2026-11-02'), 'A Family', '');
  ctx.claimDate(props, p.key, p.form, p.label('2026-11-03'), 'B Family', undefined);
  ctx.claimDate(props, p.key, p.form, p.label('2026-11-04'), 'C Family', '   ');

  assert.strictEqual(ctx.$.sentMail.length, 0);
});
