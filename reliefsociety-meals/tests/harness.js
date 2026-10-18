'use strict';
/**
 * Loads reliefsociety-meal-signup.gs into a sandbox with the fake Apps
 * Script services, so tests can call its functions directly.
 *
 * The .gs file is read and evaluated as-is: there is no build step and
 * no second copy of the logic, so the tests run against exactly the
 * text that gets pasted into the Apps Script editor.
 */

// The script's dates are built in the project time zone. Pin the host
// to the same one (before any Date is made) so day boundaries and the
// UTC times in calendar invites come out the same on every machine.
process.env.TZ = 'America/Chicago';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const fakes = require('./apps-script-fakes');

const SCRIPT_PATH = path.join(__dirname, '..', 'reliefsociety-meal-signup.gs');
const SOURCE = fs.readFileSync(SCRIPT_PATH, 'utf8');

/**
 * Freezes the clock at `now`. `new Date(...)` with arguments still
 * behaves normally (the script parses date strings constantly), and
 * `new Date()` returns a fresh copy each time, because the script does
 * `const today = new Date(); today.setHours(0, 0, 0, 0)` and a shared
 * object would let that move the clock for everything afterwards.
 */
function frozenDateSource(now) {
  return `
    (function (RealDate, fixedTime) {
      function FrozenDate(...args) {
        if (args.length === 0) return new RealDate(fixedTime);
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
 * Rewrites settings constants in the source: the functions a person
 * runs from the editor (createSignupForm, extendSignupForm,
 * cancelSignup, forgetPerson) read PERSON_NAME, START_DATE and so on
 * instead of taking arguments, so this is the only way to drive them.
 *
 * Each override must match exactly one declaration or this throws: a
 * silently missed rename would leave a test running against the file's
 * real value. Values are raw JS source, so quote strings:
 * {PERSON_NAME: "'The Smiths'"}. Multi-line array settings
 * (EXCLUDE_DATES) are replaced up to their closing `];` line.
 */
function applyConfig(source, config) {
  if (!config) return source;
  return Object.keys(config).reduce((text, name) => {
    const decl = '^const\\s+' + name + '\\s*=\\s*';
    const matches = text.match(new RegExp(decl, 'mg')) || [];
    if (matches.length !== 1) {
      throw new Error('config override for "' + name + '" matched ' + matches.length +
        ' declarations in reliefsociety-meal-signup.gs, expected exactly 1');
    }
    const pattern = new RegExp(decl + '(?:\\[[^\\]]*?$[\\s\\S]*?^\\];|[^\\n]*?;)', 'm');
    return text.replace(pattern, () => 'const ' + name + ' = ' + config[name] + ';');
  }, source);
}

/** Runs the script source in a new sandbox wired to an existing environment. */
function instantiate(env, opts) {
  const context = vm.createContext(Object.assign({}, env.globals));
  const source = applyConfig(SOURCE, opts.config);
  vm.runInContext(source + '\nDate = ' + frozenDateSource(opts.now), context);

  // Top-level `const` lives in the script's lexical scope rather than
  // on the sandbox object; this runs in that scope and hands them out.
  vm.runInContext(`globalThis.CONST = {
    PERSON_NAME, START_DATE, END_DATE, WARD_NAME, PARENT_FOLDER_NAME,
    Q_NAME, Q_PHONE, Q_EMAIL,
    Q_ADMIN_NAME, Q_ADMIN_START, Q_ADMIN_END, Q_ADMIN_EXCLUDE,
    Q_ADMIN_TITLE, Q_ADMIN_DESCRIPTION, ADMIN_FORM_TITLE
  };`, context);

  context.$ = env;
  context.now = opts.now;
  context.config = opts.config || {};

  /**
   * The same Google account and Drive, with the script re-pasted using
   * different settings and/or run at a different time. This is how a
   * test does "change PERSON_NAME, then run X", like a person would.
   */
  context.rerun = more => instantiate(env, {
    now: (more && more.now) || opts.now,
    config: Object.assign({}, opts.config, more && more.config)
  });
  return context;
}

/**
 * options:
 *   now      Date the script should think it is (required)
 *   config   {CONST_NAME: 'raw js source'} overrides, see applyConfig
 *
 * Returns the sandbox, which exposes every top-level function in the
 * .gs file, CONST (the settings constants), and $ (the fakes' state).
 */
function load(options) {
  const opts = options || {};
  if (!opts.now) throw new Error('harness.load() needs a `now` so time is deterministic');
  return instantiate(fakes.buildEnvironment(), opts);
}

/**
 * Copies a value the script produced into the host realm. Arrays and
 * objects made inside the sandbox have the sandbox's prototypes, and
 * assert.deepStrictEqual compares prototypes, so wrap them in plain()
 * before comparing with a literal.
 */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { load, plain, applyConfig, SCRIPT_PATH };
