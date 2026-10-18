'use strict';
/**
 * The coordinator's request form: createAdminSetupForm() makes it,
 * onAdminSetupSubmit() turns each submission into a new sign-up, and
 * reinstallAdminTrigger() / forgetAdminSetupForm() repair it.
 */

const test = require('node:test');
const assert = require('node:assert');

const { load, handles, adminSubmit, triggers } = require('./fixtures');

/** The admin form set up, returning its form and response sheet. */
function setUp() {
  const ctx = load();
  ctx.createAdminSetupForm();
  return {
    ctx,
    form: ctx.$.drive.forms.get(ctx.$.properties.ADMIN_FORM_ID),
    sheet: ctx.$.drive.spreadsheets.get(ctx.$.properties.ADMIN_RESPONSES_ID).getActiveSheet()
  };
}

test('creates the request form with its six questions and a Result column', () => {
  const { ctx, form, sheet } = setUp();
  const C = ctx.CONST;

  assert.strictEqual(form.getTitle(), 'Plano 4th Ward Meal Sign-Up — New Request');
  assert.deepStrictEqual(form.getItems().map(i => [i.getTitle(), i.isRequired()]), [
    [C.Q_ADMIN_NAME, true],
    [C.Q_ADMIN_START, true],
    [C.Q_ADMIN_END, true],
    [C.Q_ADMIN_EXCLUDE, false],
    [C.Q_ADMIN_TITLE, false],
    [C.Q_ADMIN_DESCRIPTION, false]
  ]);
  assert.strictEqual(sheet.getRange(1, 8).getValue(), 'Result', 'right after Timestamp + six answers');
  assert.deepStrictEqual(triggers(ctx),
    [{ handler: 'onAdminSetupSubmit', sourceId: ctx.$.properties.ADMIN_RESPONSES_ID, event: 'ON_FORM_SUBMIT' }]);
  assert.strictEqual(ctx.$.drive.files.get(form.getId()).folder.getName(), 'Relief Society Meals');
  assert.strictEqual(ctx.$.drive.files.get(form.getId()).sharing, null, 'never shared publicly');
});

test('running it a second time only logs the existing link', () => {
  const { ctx, form } = setUp();
  ctx.$.logs.length = 0;
  ctx.createAdminSetupForm();
  assert.match(ctx.$.logs.join('\n'), /already exists/);
  assert.ok(ctx.$.logs.join('\n').includes(form.getPublishedUrl()));
  assert.strictEqual(ctx.$.triggers.length, 1);
});

test('if the request form was deleted, running it again makes a fresh one', () => {
  const { ctx, form } = setUp();
  ctx.$.drive.deleteFile(form.getId());
  ctx.createAdminSetupForm();
  assert.notStrictEqual(ctx.$.properties.ADMIN_FORM_ID, form.getId());
  assert.ok(ctx.$.drive.forms.has(ctx.$.properties.ADMIN_FORM_ID));
});

test('a submission creates the sign-up and writes its links in the Result column', () => {
  const { ctx } = setUp();

  const result = adminSubmit(ctx, {
    name: 'The Johnson Family', start: '2026-11-02', end: '2026-11-08',
    exclude: '2026-11-04, 2026-11-06 to 2026-11-07', title: 'Johnson meals', description: 'Thank you!'
  });

  const p = handles(ctx, 'The Johnson Family');
  assert.match(result, /^Created!/);
  assert.ok(result.includes(p.form.getPublishedUrl()));
  assert.ok(result.includes(p.schedule.getUrl()));
  assert.ok(result.includes(p.responses.getUrl()));
  assert.strictEqual(p.form.getTitle(), 'Johnson meals');
  assert.match(p.form.getDescription(), /^Thank you!/);
  assert.deepStrictEqual(p.form.choices(), [
    'Monday, November 2, 2026', 'Tuesday, November 3, 2026', 'Thursday, November 5, 2026', 'Sunday, November 8, 2026'
  ]);
});

test('blank optional answers fall back to the generated title', () => {
  const { ctx } = setUp();
  adminSubmit(ctx, { name: 'The Johnson Family', start: '2026-11-02', end: '2026-11-02' });
  assert.strictEqual(handles(ctx, 'The Johnson Family').form.getTitle(),
    'Plano 4th Ward Meal Sign-Up for The Johnson Family');
});

test('a mistake in the answers is written to Result instead of failing silently', () => {
  const { ctx } = setUp();
  const result = adminSubmit(ctx, { name: 'The Johnson Family', start: '2026-11-08', end: '2026-11-02' });
  assert.strictEqual(result, 'ERROR: End date must be on or after the start date.');
  assert.strictEqual(ctx.$.drive.forms.size, 1, 'only the request form exists');

  const badExclude = adminSubmit(ctx, { name: 'The Johnson Family', start: '2026-11-02', end: '2026-11-08', exclude: 'Nov 4' });
  assert.match(badExclude, /^ERROR: "Nov 4" in the exclude list is not a valid yyyy-mm-dd date/);
});

test('submitting for someone already set up says so, with their link', () => {
  const { ctx } = setUp();
  adminSubmit(ctx, { name: 'The Johnson Family', start: '2026-11-02', end: '2026-11-08' });
  const result = adminSubmit(ctx, { name: 'The Johnson Family', start: '2026-12-01', end: '2026-12-08' });

  assert.match(result, /^Already exists — sign-up: /);
  assert.ok(result.includes(handles(ctx, 'The Johnson Family').form.getPublishedUrl()));
  assert.match(result, /run extendSignupForm\(\)/);
});

test('reinstallAdminTrigger: replaces the trigger without making duplicates', () => {
  const { ctx } = setUp();
  ctx.reinstallAdminTrigger();
  ctx.reinstallAdminTrigger();
  assert.deepStrictEqual(triggers(ctx).map(t => t.handler), ['onAdminSetupSubmit']);
});

test('reinstallAdminTrigger: puts back a trigger that went missing', () => {
  const { ctx } = setUp();
  ctx.$.triggers.length = 0;
  ctx.reinstallAdminTrigger();
  assert.deepStrictEqual(triggers(ctx),
    [{ handler: 'onAdminSetupSubmit', sourceId: ctx.$.properties.ADMIN_RESPONSES_ID, event: 'ON_FORM_SUBMIT' }]);
});

test('reinstallAdminTrigger: explains when there is no request form yet', () => {
  const ctx = load();
  assert.throws(() => ctx.reinstallAdminTrigger(), /run createAdminSetupForm\(\) first/);
});

test('forgetAdminSetupForm: removes its trigger and record, but no one\'s sign-up', () => {
  const { ctx } = setUp();
  adminSubmit(ctx, { name: 'The Johnson Family', start: '2026-11-02', end: '2026-11-08' });

  ctx.forgetAdminSetupForm();

  assert.deepStrictEqual(triggers(ctx).map(t => t.handler), ['onSignup', 'onResponsesEdit']);
  assert.strictEqual(ctx.$.properties.ADMIN_FORM_ID, undefined);
  assert.strictEqual(ctx.$.properties.ADMIN_RESPONSES_ID, undefined);
  assert.ok(handles(ctx, 'The Johnson Family').form);
});
