'use strict';
/**
 * Builds a realistic schedule spreadsheet + SCHEDULE_MAP for tests, by
 * running the script's OWN buildCalendarBlocks() and renderSchedule()
 * rather than hand-rolling a fake layout.
 *
 * That matters: the row/column numbers in SCHEDULE_MAP and the exact
 * dateLabel strings are what every lookup in the script depends on, so
 * a hand-made fixture that got them subtly wrong would test the wrong
 * thing. Here the fixture is produced the same way production produces
 * it.
 */

const harness = require('./harness');
const { FakeSpreadsheet } = require('./apps-script-fakes');

const SCHEDULE_ID = 'sched-1';
const RESPONSES_ID = 'resp-1';
const FORM_ID = 'form-1';

/**
 * options:
 *   now        the frozen clock (required)
 *   from, to   'yyyy-mm-dd' range to draw on the calendar (required)
 *   choices    dropdown values; defaults to every available date drawn
 *   accepting, closedMessage, triggers, textItems  passed through
 *
 * Returns the loaded sandbox, with `schedule`, `responses`, `sheet` and
 * `dateMap` attached.
 */
function withSchedule(options) {
  const opts = options || {};
  const schedule = new FakeSpreadsheet('Schedule SS', ['Schedule']);
  const responses = new FakeSpreadsheet('Responses SS', ['Form Responses 1']);
  const spreadsheets = { [SCHEDULE_ID]: schedule, [RESPONSES_ID]: responses };

  // First load: draw the calendar using the script's own renderer
  const setup = harness.load({
    now: opts.now,
    spreadsheets: spreadsheets,
    properties: {}
  });

  const blocks = setup.buildCalendarBlocks(
    new Date(opts.from + 'T00:00:00'),
    new Date(opts.to + 'T00:00:00'));
  const dateMap = setup.renderSchedule(schedule, blocks);

  const allDates = Object.keys(dateMap)
    .sort((a, b) => (dateMap[a].iso < dateMap[b].iso ? -1 : 1));

  // Second load: the real context under test, with the drawn calendar
  // and a dropdown in place
  const ctx = harness.load({
    now: opts.now,
    config: opts.config,
    choices: opts.choices || allDates,
    accepting: opts.accepting,
    closedMessage: opts.closedMessage,
    textItems: opts.textItems,
    triggers: opts.triggers,
    spreadsheets: spreadsheets,
    properties: Object.assign({
      FORM_ID: FORM_ID,
      SCHEDULE_ID: SCHEDULE_ID,
      RESPONSES_ID: RESPONSES_ID,
      SCHEDULE_MAP: JSON.stringify(dateMap),
      ADDED_MONTHS: JSON.stringify(blocks.map(b => b.key))
    }, opts.properties)
  });

  ctx.schedule = schedule;
  ctx.responses = responses;
  ctx.sheet = schedule.getSheetByName('Schedule');
  ctx.dateMap = dateMap;
  ctx.allDates = allDates;
  ctx.blocks = blocks;
  return ctx;
}

/** The text currently in the calendar square for a dateLabel. */
function square(ctx, label) {
  const ref = ctx.dateMap[label];
  if (!ref) throw new Error('no square for ' + label);
  return ctx.sheet.getRange(ref.row, ref.col).getValue();
}

/** The background colour of the calendar square for a dateLabel. */
function squareColor(ctx, label) {
  const ref = ctx.dateMap[label];
  return ctx.sheet.getRange(ref.row, ref.col).getBackground();
}

/**
 * Current dropdown values, copied into a host-realm array.
 *
 * Array.from rather than .slice(): arrays the script creates live in
 * the sandbox realm, and assert.deepStrictEqual compares prototypes,
 * so a sandbox array never matches a plain one from a test.
 */
function choices(ctx) {
  return Array.from(ctx.$.form.choices);
}

/** The dateLabel for an iso date, from the fixture's map. */
function labelFor(ctx, iso) {
  const found = Object.keys(ctx.dateMap).find(l => ctx.dateMap[l].iso === iso);
  if (!found) throw new Error('no date label for ' + iso + ' in this fixture');
  return found;
}

module.exports = {
  withSchedule, square, squareColor, choices, labelFor,
  SCHEDULE_ID, RESPONSES_ID, FORM_ID
};
