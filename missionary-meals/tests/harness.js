'use strict';
/**
 * Loads missionary-meal-signup.gs into a sandbox with the fake Apps
 * Script services, so tests can call its functions directly.
 *
 * The .gs file is read and evaluated as-is: there is no build step and
 * no second copy of the logic, so the tests run against exactly the
 * bytes that get pasted into the Apps Script editor.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const fakes = require('./apps-script-fakes');

const SCRIPT_PATH = path.join(__dirname, '..', 'missionary-meal-signup.gs');

/**
 * Freezes the clock at `now`.
 *
 * Both halves of this matter, and both were learned the hard way while
 * throwing together earlier versions of this harness:
 *
 *  - `new Date(...)` with arguments must behave normally. parseDateLabel()
 *    does `new Date('September 17 2026')`; a stub that ignores arguments
 *    makes every date comparison in the script silently wrong, and the
 *    tests then pass while testing nothing.
 *  - `new Date()` with no arguments must return a FRESH COPY. The script
 *    does `const today = new Date(); today.setHours(0, 0, 0, 0)` in six
 *    places; handing back a shared object lets the first such call move
 *    the clock for everything afterwards.
 */
function frozenDateSource(now) {
  return `
    (function (RealDate, fixedTime) {
      function FrozenDate(...args) {
        if (args.length === 0) return new RealDate(fixedTime);
        if (args.length === 1) return new RealDate(args[0]);
        return new RealDate(...args);
      }
      FrozenDate.prototype = RealDate.prototype;
      FrozenDate.now = () => fixedTime;
      FrozenDate.parse = RealDate.parse;
      FrozenDate.UTC = RealDate.UTC;
      return FrozenDate;
    })(Date, ${now.getTime()});
  `;
}

/**
 * Rewrites single-line config constants in the source, for the
 * functions that read a constant instead of taking an argument —
 * removeOldMonths() reads REMOVE_MONTHS, cancelSignup() reads
 * CANCEL_DATE, and so on. These are exactly the constants a human
 * edits by hand before running those functions, so overriding them is
 * how you drive that code at all.
 *
 * Each substitution must match exactly one line or this throws: a
 * silently-missed rename would leave the test running against the
 * file's real value and quietly stop testing anything.
 *
 * `config` values are raw JS source, so quote strings: {CANCEL_DATE: "'2026-09-17'"}
 */
function applyConfig(source, config) {
  if (!config) return source;

  return Object.keys(config).reduce((text, name) => {
    // Declarations in the file are space-padded for alignment
    // ("const END_DATE   = ..."), so don't insist on single spaces.
    const decl = '^const\\s+' + name + '\\s*=\\s*';
    const pattern = new RegExp(decl + '[^\\n]*?;', 'm');
    const matches = text.match(new RegExp(decl, 'mg')) || [];
    if (matches.length !== 1) {
      throw new Error('config override for "' + name + '" matched ' + matches.length +
        ' declarations in missionary-meal-signup.gs — expected exactly 1');
    }
    return text.replace(pattern, 'const ' + name + ' = ' + config[name] + ';');
  }, source);
}

/**
 * options:
 *   now          Date the script should think it is (required)
 *   config       {CONST_NAME: 'raw js source'} overrides, see applyConfig
 *   choices      dropdown values on the form
 *   accepting    whether the form starts open (default true)
 *   closedMessage the form's current closed message
 *   textItems    [{title, required}] for the form's text questions
 *   properties   script properties, e.g. {FORM_ID, SCHEDULE_ID, SCHEDULE_MAP}
 *   spreadsheets {id: FakeSpreadsheet}
 *   triggers     handler names already installed
 *
 * Returns the sandbox, which exposes every top-level function and const
 * in the .gs file, plus the fakes' state (logs, sentMail, form, ...).
 */
function load(options) {
  const opts = options || {};
  if (!opts.now) throw new Error('harness.load() needs a `now` so time is deterministic');

  const env = fakes.buildEnvironment(opts);
  const context = vm.createContext(Object.assign({}, env.globals));

  const source = applyConfig(fs.readFileSync(SCRIPT_PATH, 'utf8'), opts.config);
  vm.runInContext(source + '\nDate = ' + frozenDateSource(opts.now), context);

  // Top-level `function` declarations become properties of the sandbox,
  // but top-level `const` does not — it lives in the script's lexical
  // scope. This snippet runs in that same scope, so it can see them and
  // hand them out.
  vm.runInContext(`globalThis.CONST = {
    START_DATE, END_DATE, WARD_NAME, FORM_TITLE, FOLDER_NAME,
    Q_NAME, Q_PHONE, Q_EMAIL,
    ALL_FILLED_CHOICE, FULL_MESSAGE, PAUSED_MESSAGE,
    SUNDAY_PAUSE, PAUSE_DAY, REOPEN_HOUR, MONTH_NAMES
  };`, context);

  // Surface the fakes' recorded state alongside the script's own functions
  context.$ = env;
  context.evaluate = expr => vm.runInContext(expr, context);
  return context;
}

/**
 * Copies a value the script produced into the host realm.
 *
 * Arrays and objects created inside the sandbox have the sandbox's
 * prototypes, and assert.deepStrictEqual compares prototypes — so a
 * value straight out of the script never matches a plain literal in a
 * test, even when the contents are identical. Wrap it in plain() first.
 */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Reads a calendar square's text, for asserting on what the script wrote. */
function squareText(sheet, row, col) {
  return sheet.getRange(row, col).getValue();
}

/** Reads a calendar square's background colour. */
function squareColor(sheet, row, col) {
  return sheet.getRange(row, col).getBackground();
}

module.exports = { load, plain, SCRIPT_PATH, squareText, squareColor };
