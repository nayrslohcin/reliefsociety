'use strict';
/**
 * Test helpers that act the way a person or Google does: set someone
 * up, submit their form, type into a spreadsheet tab. Each one goes
 * through the script's real entry points (createSignupForCore,
 * onSignup, onResponsesEdit, onAdminSetupSubmit) rather than poking at
 * script properties, so the tests exercise the same paths production
 * does.
 */

const harness = require('./harness');

/**
 * Sets up a person through createSignupForCore() and returns handles
 * to everything it made:
 *   { key, form, responses, schedule, sheet, map, label(iso), square(iso) }
 */
function person(ctx, config) {
  const cfg = Object.assign({ personName: 'Jane Doe', startDate: '2026-11-02', endDate: '2026-11-08' }, config);
  const result = ctx.createSignupForCore(cfg);
  if (result.status !== 'created') throw new Error('expected a new person, got ' + result.status);
  return handles(ctx, cfg.personName);
}

/** Handles to an already-set-up person's files, found through the script's own records. */
function handles(ctx, personName) {
  const key = ctx.sanitizePersonKey(personName);
  const prop = base => ctx.$.properties['p:' + key + ':' + base];
  const schedule = ctx.$.drive.spreadsheets.get(prop('SCHEDULE_ID'));
  const sheet = schedule.getSheetByName('Schedule');
  const h = {
    key,
    form: ctx.$.drive.forms.get(prop('FORM_ID')),
    responses: ctx.$.drive.spreadsheets.get(prop('RESPONSES_ID')),
    schedule,
    sheet,
    get map() { return JSON.parse(prop('SCHEDULE_MAP')); },
    prop,
    label: iso => {
      const map = h.map;
      const found = Object.keys(map).find(l => map[l].iso === iso);
      if (!found) throw new Error('no schedule square for ' + iso);
      return found;
    },
    square: iso => {
      const ref = h.map[h.label(iso)];
      return sheet.getRange(ref.row, ref.col).getValue();
    },
    squareColor: iso => {
      const ref = h.map[h.label(iso)];
      return sheet.getRange(ref.row, ref.col).getBackground();
    }
  };
  return h;
}

/**
 * Submits a person's sign-up form, the way Google does: fires onSignup
 * with an event whose item responses match the form's questions.
 * `answers` = {name, phone, email, date} where date is a dropdown label.
 */
function submit(ctx, form, answers) {
  const byTitle = {
    [ctx.CONST.Q_NAME]: answers.name,
    [ctx.CONST.Q_PHONE]: answers.phone || '555-0100',
    [ctx.CONST.Q_EMAIL]: answers.email || ''
  };
  const itemResponses = form.getItems()
    .map(item => {
      const value = item.getType() === 'LIST' ? answers.date : byTitle[item.getTitle()];
      return value === undefined ? null : { getItem: () => item, getResponse: () => value };
    })
    .filter(r => r);
  ctx.onSignup({ source: form, response: { getItemResponses: () => itemResponses } });
}

/**
 * Types a row into one of a person's spreadsheet tabs and fires the
 * onEdit trigger for it, like a person typing in Google Sheets.
 * Returns the sheet so the test can read the Status column back.
 */
function typeRow(ctx, spreadsheet, tabName, row, values) {
  const sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) throw new Error('no "' + tabName + '" tab on ' + spreadsheet.getName());
  const range = sheet.getRange(row, 1, 1, values.length).setValues([values]);
  ctx.onResponsesEdit({ range });
  return sheet;
}

/**
 * Submits the admin request form: appends the answers as a row on its
 * response sheet (as Google does), then fires onAdminSetupSubmit.
 * `answers` is keyed by the short names below. Returns the Result cell.
 */
function adminSubmit(ctx, answers) {
  const C = ctx.CONST;
  const ss = ctx.$.drive.spreadsheets.get(ctx.$.properties.ADMIN_RESPONSES_ID);
  const sheet = ss.getActiveSheet();
  const row = Math.max(sheet.getLastRow(), 1) + 1;
  const values = [new Date(), answers.name || '', answers.start || '', answers.end || '',
    answers.exclude || '', answers.title || '', answers.description || ''];
  sheet.getRange(row, 1, 1, values.length).setValues([values]);

  const namedValues = {
    [C.Q_ADMIN_NAME]: [answers.name || ''],
    [C.Q_ADMIN_START]: [answers.start || ''],
    [C.Q_ADMIN_END]: [answers.end || ''],
    [C.Q_ADMIN_EXCLUDE]: [answers.exclude || ''],
    [C.Q_ADMIN_TITLE]: [answers.title || ''],
    [C.Q_ADMIN_DESCRIPTION]: [answers.description || '']
  };
  ctx.onAdminSetupSubmit({ namedValues, range: sheet.getRange(row, 1, 1, values.length) });
  return sheet.getRange(row, 8).getValue();
}

/** Triggers currently installed, as plain {handler, sourceId, event} records. */
function triggers(ctx) {
  return ctx.$.triggers.map(t => Object.assign({}, t._info));
}

/** Wednesday, October 28, 2026, mid-morning: before the default test range starts. */
const OCT_28 = new Date(2026, 9, 28, 10, 0);

/** Loads the script at a fixed time, with optional setting overrides. */
function load(config, now) {
  return harness.load({ now: now || OCT_28, config });
}

module.exports = { person, handles, submit, typeRow, adminSubmit, triggers, load, OCT_28, plain: harness.plain };
