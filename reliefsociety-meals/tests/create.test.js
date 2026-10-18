'use strict';
/**
 * Setting someone up: createSignupForCore(), and createSignupForm(),
 * which drives it from the settings at the top of the file.
 */

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const { load, person, handles, triggers, plain } = require('./fixtures');

const BASE = { personName: 'Jane Doe', startDate: '2026-11-02', endDate: '2026-11-08' };

test('creates a form with the questions and one choice per day', () => {
  const ctx = load();
  const p = person(ctx, Object.assign({}, BASE, { excludeDates: ['2026-11-04'] }));

  assert.strictEqual(p.form.getTitle(), 'Plano 4th Ward Meal Sign-Up for Jane Doe');
  const questions = p.form.getItems().map(i => [i.getType(), i.getTitle(), i.isRequired()]);
  assert.deepStrictEqual(questions, [
    ['TEXT', ctx.CONST.Q_NAME, true],
    ['TEXT', ctx.CONST.Q_PHONE, true],
    ['TEXT', ctx.CONST.Q_EMAIL, true],
    ['LIST', 'Choose a date', true]
  ]);
  assert.strictEqual(p.form.choices().length, 6, 'seven days minus the excluded one');
  assert.ok(!p.form.choices().includes('Wednesday, November 4, 2026'));
  assert.ok(p.form.isAcceptingResponses());
});

test('the form description thanks people and links the schedule', () => {
  const ctx = load();
  const p = person(ctx, BASE);
  assert.match(p.form.getDescription(), /^Thank you for signing up to bring a meal for Jane Doe!/);
  assert.ok(p.form.getDescription().endsWith(p.schedule.getUrl()));
});

test('a custom title and description replace the generated ones', () => {
  const ctx = load();
  const p = person(ctx, Object.assign({}, BASE, { formTitle: '  Meals for Jane  ', description: 'Bring soup.' }));
  assert.strictEqual(p.form.getTitle(), 'Meals for Jane');
  assert.match(p.form.getDescription(), /^Bring soup\.\n\n/);
});

test('makes a private responses sheet with Quick Add and Quick Cancel tabs', () => {
  const ctx = load();
  const p = person(ctx, BASE);

  assert.strictEqual(p.form.destinationId, p.responses.getId(), 'form answers go to the private sheet');
  assert.deepStrictEqual(p.responses.getSheets().map(s => s.getName()),
    ['Form Responses 1', 'Sheet1', 'Quick Add', 'Quick Cancel']);
  assert.deepStrictEqual(p.responses.getSheetByName('Quick Add').rowValues(1, 5),
    ['Name', 'Phone', 'Email (optional)', 'Date (yyyy-mm-dd)', 'Status']);
  assert.deepStrictEqual(p.responses.getSheetByName('Quick Cancel').rowValues(1, 2),
    ['Date (yyyy-mm-dd)', 'Status']);
});

test('only the schedule is shared, and all three files go in the person\'s own folder', () => {
  const ctx = load();
  const p = person(ctx, BASE);
  const files = ctx.$.drive.files;

  assert.strictEqual(files.get(p.schedule.getId()).sharing, 'ANYONE_WITH_LINK:VIEW');
  assert.strictEqual(files.get(p.responses.getId()).sharing, null, 'the private sheet is never shared');
  assert.strictEqual(files.get(p.form.getId()).sharing, null);

  const folder = files.get(p.form.getId()).folder;
  assert.strictEqual(folder.getName(), 'Jane Doe');
  assert.strictEqual(folder.parent.getName(), 'Relief Society Meals');
  assert.strictEqual(files.get(p.responses.getId()).folder, folder);
  assert.strictEqual(files.get(p.schedule.getId()).folder, folder);
});

test('two people share the "Relief Society Meals" folder but get their own subfolders', () => {
  const ctx = load();
  const a = person(ctx, BASE);
  const b = person(ctx, Object.assign({}, BASE, { personName: 'The Smiths' }));
  const folderOf = h => ctx.$.drive.files.get(h.form.getId()).folder;

  assert.notStrictEqual(folderOf(a), folderOf(b));
  assert.strictEqual(folderOf(a).parent, folderOf(b).parent);
  assert.strictEqual(ctx.$.drive.folders.filter(f => f.getName() === 'Relief Society Meals').length, 1);
});

test('records the person and installs their two triggers', () => {
  const ctx = load();
  const p = person(ctx, BASE);

  assert.strictEqual(p.prop('DISPLAY_NAME'), 'Jane Doe');
  assert.deepStrictEqual(JSON.parse(p.prop('ADDED_MONTHS')), ['2026-11']);
  assert.deepStrictEqual(JSON.parse(ctx.$.properties.PEOPLE), [{ key: 'jane-doe', name: 'Jane Doe' }]);
  assert.strictEqual(ctx.$.properties['formId:' + p.form.getId()], 'jane-doe');
  assert.strictEqual(ctx.$.properties['ssId:' + p.responses.getId()], 'jane-doe');

  assert.deepStrictEqual(triggers(ctx), [
    { handler: 'onSignup', sourceId: p.form.getId(), event: 'ON_FORM_SUBMIT' },
    { handler: 'onResponsesEdit', sourceId: p.responses.getId(), event: 'ON_EDIT' }
  ]);
});

test('the schedule map covers every choice on the form', () => {
  const ctx = load();
  const p = person(ctx, Object.assign({}, BASE, { endDate: '2026-12-03' }));
  assert.deepStrictEqual(Object.keys(p.map).sort(), p.form.choices().slice().sort());
  assert.deepStrictEqual(JSON.parse(p.prop('ADDED_MONTHS')), ['2026-11', '2026-12']);
});

test('starting part-way through a range: past days are greyed out and left off the form', () => {
  const ctx = load({}, new Date(2026, 10, 4, 9, 0)); // Wed Nov 4
  const p = person(ctx, BASE);

  assert.strictEqual(p.form.choices()[0], 'Wednesday, November 4, 2026');
  assert.strictEqual(p.square('2026-11-02'), '2\n(past)');
  assert.strictEqual(p.square('2026-11-04'), '4\n— available —');
});

test('refuses bad input before creating anything', () => {
  const ctx = load();
  const attempts = [
    [{ personName: '   ' }, /Person name is required/],
    [{ startDate: '11/02/2026' }, /Start date must be in yyyy-mm-dd format/],
    [{ endDate: '2026-11-8' }, /End date must be in yyyy-mm-dd format/],
    [{ startDate: '2026-11-08', endDate: '2026-11-02' }, /End date must be on or after the start date/],
    [{ excludeDates: ['2026-11-04', ['2026-11-05', 'Nov 6']] }, /"Nov 6" in the exclude list is not a valid/]
  ];
  for (const [change, message] of attempts) {
    assert.throws(() => ctx.createSignupForCore(Object.assign({}, BASE, change)), message);
  }
  assert.strictEqual(ctx.$.drive.files.size, 0, 'no forms or sheets were made');
  assert.strictEqual(ctx.$.triggers.length, 0);
});

test('setting up the same person twice returns the existing form and makes nothing new', () => {
  const ctx = load();
  const p = person(ctx, BASE);
  const filesBefore = ctx.$.drive.files.size;

  const again = ctx.createSignupForCore(Object.assign({}, BASE, { personName: 'jane  doe' }));

  assert.strictEqual(again.status, 'exists');
  assert.strictEqual(again.form, p.form);
  assert.strictEqual(ctx.$.drive.files.size, filesBefore);
  assert.strictEqual(ctx.$.triggers.length, 2);
});

test('if the person\'s form was deleted from Drive, the old record is replaced with a fresh setup', () => {
  const ctx = load();
  const old = person(ctx, BASE);
  ctx.$.drive.deleteFile(old.form.getId());

  const fresh = person(ctx, BASE);

  assert.notStrictEqual(fresh.form.getId(), old.form.getId());
  assert.strictEqual(ctx.$.properties['formId:' + old.form.getId()], undefined);
  assert.deepStrictEqual(triggers(ctx).map(t => t.sourceId),
    [fresh.form.getId(), fresh.responses.getId()], 'the old form\'s triggers are removed, not left behind');
});

test('a form moved to Trash counts as deleted too', () => {
  const ctx = load();
  const old = person(ctx, BASE);
  ctx.$.drive.trashFile(old.form.getId());

  const result = ctx.createSignupForCore(BASE);
  assert.strictEqual(result.status, 'created');
  assert.strictEqual(ctx.$.triggers.length, 2);
});

test('stops before creating anything once the project is at Google\'s trigger limit', () => {
  const ctx = load();
  for (let i = 1; i <= 9; i++) person(ctx, Object.assign({}, BASE, { personName: 'Family ' + i }));
  ctx.createAdminSetupForm(); // one more trigger: 19 in all
  const filesBefore = ctx.$.drive.files.size;

  assert.throws(() => ctx.createSignupForCore(Object.assign({}, BASE, { personName: 'Family 10' })),
    /as many sign-ups as Google allows/);
  assert.strictEqual(ctx.$.drive.files.size, filesBefore);
  assert.strictEqual(ctx.$.triggers.length, 19);
});

test('createSignupForm: uses the settings at the top of the file and logs the links', () => {
  const ctx = load({
    PERSON_NAME: "'The Johnson Family'",
    START_DATE: "'2026-11-10'",
    END_DATE: "'2026-11-12'",
    EXCLUDE_DATES: "['2026-11-11']"
  });
  ctx.createSignupForm();

  const p = handles(ctx, 'The Johnson Family');
  assert.deepStrictEqual(p.form.choices(), ['Tuesday, November 10, 2026', 'Thursday, November 12, 2026']);
  const log = ctx.$.logs.join('\n');
  assert.ok(log.includes(p.form.getPublishedUrl()), 'the sign-up link');
  assert.ok(log.includes(p.schedule.getUrl()), 'the schedule link');
  assert.ok(log.includes(p.responses.getUrl()), 'the private responses link');
  assert.ok(log.includes(p.form.getEditUrl()), 'the form edit link');
});

test('createSignupForm: running it again only logs the existing link', () => {
  const ctx = load({ PERSON_NAME: "'Jane Doe'" });
  ctx.createSignupForm();
  ctx.$.logs.length = 0;

  ctx.createSignupForm();

  assert.match(ctx.$.logs[0], /already exists for "Jane Doe"/);
  assert.strictEqual(ctx.$.drive.forms.size, 1);
});

test('the config override in the harness really changes the setting', () => {
  // Guards the harness itself: if EXCLUDE_DATES stopped being replaced,
  // every test that sets it would quietly test the file's default.
  const ctx = load({ EXCLUDE_DATES: "['2026-11-11', ['2026-11-13', '2026-11-14']]" });
  assert.deepStrictEqual(plain(vm.runInContext('EXCLUDE_DATES', ctx)),
    ['2026-11-11', ['2026-11-13', '2026-11-14']]);
});
