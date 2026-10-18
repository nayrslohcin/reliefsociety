'use strict';
/**
 * Stand-ins for the Google Apps Script services that
 * reliefsociety-meal-signup.gs calls, good enough to run the real
 * script under Node.
 *
 * This script creates a separate form, two spreadsheets and a Drive
 * folder for every person, and tells them apart by ID, so unlike a
 * single-form fake these keep a registry of every file created and
 * hand back the right one from openById()/getFileById(). Opening an ID
 * that was never created (or was deleted) throws, the same as the real
 * services, because the script's stale-record recovery depends on it.
 *
 * Only behaviour the script reads back is modelled: cell values and
 * backgrounds, dropdown choices, whether a form is accepting
 * responses, sharing, which folder a file is in, and which triggers
 * exist (with their source file). Fonts, borders and sizes are
 * chainable no-ops.
 */

const GREEN = '#93c47d';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * Utilities.formatDate for the patterns the script uses. 'Etc/UTC' is
 * honoured (the .ics invite formats its times in UTC); any other zone
 * is treated as the host zone, which the harness pins to the project's
 * America/Chicago so the two agree, the way they do in Apps Script.
 */
function formatDate(date, tz, pattern) {
  const utc = tz === 'Etc/UTC' || tz === 'UTC';
  const parts = {
    year: utc ? date.getUTCFullYear() : date.getFullYear(),
    month: utc ? date.getUTCMonth() : date.getMonth(),
    day: utc ? date.getUTCDate() : date.getDate(),
    weekday: utc ? date.getUTCDay() : date.getDay(),
    hours: utc ? date.getUTCHours() : date.getHours(),
    minutes: utc ? date.getUTCMinutes() : date.getMinutes(),
    seconds: utc ? date.getUTCSeconds() : date.getSeconds()
  };

  const out = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "'") { // quoted literal, e.g. the T and Z in an .ics stamp
      const end = pattern.indexOf("'", i + 1);
      if (end === -1) throw new Error('unterminated quote in pattern: ' + pattern);
      out.push(pattern.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let run = 0;
      while (pattern[i + run] === ch) run++;
      out.push(token(parts, ch, run, pattern));
      i += run;
      continue;
    }
    out.push(ch);
    i++;
  }
  return out.join('');
}

function token(p, ch, run, pattern) {
  switch (ch) {
    case 'y': return run <= 2 ? pad(p.year % 100, 2) : String(p.year);
    case 'M': return run >= 4 ? MONTHS[p.month]
      : run === 3 ? MONTHS[p.month].slice(0, 3)
      : pad(p.month + 1, run);
    case 'd': return pad(p.day, run);
    case 'E': return run >= 4 ? DAYS[p.weekday] : DAYS[p.weekday].slice(0, 3);
    case 'H': return pad(p.hours, run);
    case 'm': return pad(p.minutes, run);
    case 's': return pad(p.seconds, run);
    default: throw new Error('unsupported pattern letter "' + ch + '" in: ' + pattern);
  }
}

/** Chainable no-op formatters, so styling calls don't need modelling. */
const NOOPS = ['setFontWeight', 'setFontSize', 'setHorizontalAlignment',
  'setVerticalAlignment', 'setWrap', 'setBorder', 'setNumberFormat', 'setNote',
  'setFontColor', 'setFontFamily'];

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows || 1;
    this.numCols = numCols || 1;
    NOOPS.forEach(name => { this[name] = () => this; });
  }

  _each(fn) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) fn(this.row + r, this.col + c);
    }
    return this;
  }

  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getLastRow() { return this.row + this.numRows - 1; }

  getValue() { return this.sheet._cell(this.row, this.col).value; }
  setValue(v) { return this._each((r, c) => { this.sheet._cell(r, c).value = v; }); }

  getValues() {
    const rows = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      for (let c = 0; c < this.numCols; c++) row.push(this.sheet._cell(this.row + r, this.col + c).value);
      rows.push(row);
    }
    return rows;
  }

  setValues(values) {
    values.forEach((row, r) => row.forEach((v, c) => {
      this.sheet._cell(this.row + r, this.col + c).value = v;
    }));
    return this;
  }

  getBackground() { return this.sheet._cell(this.row, this.col).background; }
  setBackground(color) { return this._each((r, c) => { this.sheet._cell(r, c).background = color; }); }

  // The script writes a name as rich text, then later reads the cell
  // back with getValue() to recover the day number, so the plain value
  // has to follow the rich text.
  setRichTextValue(rich) { return this.setValue(rich.getText()); }

  merge() { return this; }
}

class FakeSheet {
  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this.cells = new Map(); // 'row,col' -> {value, background}
  }

  _cell(row, col) {
    const key = row + ',' + col;
    if (!this.cells.has(key)) this.cells.set(key, { value: '', background: '#ffffff' });
    return this.cells.get(key);
  }

  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getParent() { return this.parent; }

  getRange(row, col, numRows, numCols) {
    if (typeof row === 'string') { // A1 notation; the script only ever uses 'A1'
      const m = row.match(/^([A-Z])(\d+)$/);
      if (!m) throw new Error('unsupported A1 notation in fake: ' + row);
      return new FakeRange(this, Number(m[2]), m[1].charCodeAt(0) - 64, 1, 1);
    }
    return new FakeRange(this, row, col, numRows, numCols);
  }

  setRowHeight() { return this; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  setFrozenRows() { return this; }

  getLastRow() {
    let last = 0;
    for (const [key, cell] of this.cells) {
      if (cell.value === '' || cell.value === null || cell.value === undefined) continue;
      last = Math.max(last, Number(key.split(',')[0]));
    }
    return last;
  }

  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((v, i) => { this._cell(row, i + 1).value = v; });
    return this;
  }

  deleteRow(row) {
    const next = new Map();
    for (const [key, cell] of this.cells) {
      const [r, c] = key.split(',').map(Number);
      if (r === row) continue;
      next.set((r > row ? r - 1 : r) + ',' + c, cell);
    }
    this.cells = next;
    return this;
  }

  /** Test helper: one row's values as a plain array. */
  rowValues(row, numCols) {
    return this.getRange(row, 1, 1, numCols).getValues()[0];
  }
}

class FakeSpreadsheet {
  constructor(drive, name) {
    this.id = drive._newId('ss');
    this.name = name;
    this.sheets = [new FakeSheet('Sheet1', this)]; // as a brand-new spreadsheet starts
  }

  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://docs.example.test/spreadsheets/' + this.id; }
  getSheets() { return this.sheets.slice(); }
  getActiveSheet() { return this.sheets[0]; }
  getSheetByName(name) { return this.sheets.find(s => s.getName() === name) || null; }

  insertSheet(name) {
    const sheet = new FakeSheet(name, this);
    this.sheets.push(sheet);
    return sheet;
  }
}

class FakeItem {
  constructor(form, type, title) {
    this.form = form;
    this.type = type;
    this.id = form.id + '-item-' + (form.items.length + 1);
    this.title = title || '';
    this.required = false;
    this.helpText = '';
    this.choices = [];
  }

  getId() { return this.id; }
  getType() { return this.type; }
  getTitle() { return this.title; }
  setTitle(t) { this.title = t; return this; }
  isRequired() { return this.required; }
  setRequired(v) { this.required = v; return this; }
  setHelpText(t) { this.helpText = t; return this; }
  setValidation() { return this; }
  asListItem() { return this; }
  asTextItem() { return this; }
  getChoices() { return this.choices.map(v => ({ getValue: () => v })); }

  setChoiceValues(values) {
    this.choices = values.slice();
    return this;
  }
}

class FakeForm {
  constructor(drive, title) {
    this.drive = drive;
    this.id = drive._newId('form');
    this.title = title;
    this.description = '';
    this.items = [];
    this.accepting = true;
    this.closedMessage = '';
    this.destinationId = null;
  }

  getId() { return this.id; }
  getTitle() { return this.title; }
  getPublishedUrl() { return 'https://forms.example.test/' + this.id + '/viewform'; }
  getEditUrl() { return 'https://forms.example.test/' + this.id + '/edit'; }
  getDescription() { return this.description; }
  setDescription(d) { this.description = d; return this; }
  setLimitOneResponsePerUser() { return this; }

  /**
   * Linking a form to a spreadsheet adds a "Form Responses 1" tab with
   * a header row (Timestamp, then one column per question). It's put
   * first here; the script relies on it being the first tab that isn't
   * Quick Add/Quick Cancel, and that answers start on row 2.
   */
  setDestination(_type, id) {
    this.destinationId = id;
    const ss = this.drive.spreadsheets.get(id);
    const tab = new FakeSheet('Form Responses 1', ss);
    ss.sheets.unshift(tab);
    tab.appendRow(['Timestamp'].concat(this.items.map(i => i.getTitle())));
    return this;
  }
  isAcceptingResponses() { return this.accepting; }
  setAcceptingResponses(v) { this.accepting = v; return this; }
  getCustomClosedFormMessage() { return this.closedMessage; }
  setCustomClosedFormMessage(m) { this.closedMessage = m; return this; }

  getItems(type) { return type ? this.items.filter(i => i.type === type) : this.items.slice(); }

  _add(type) {
    const item = new FakeItem(this, type);
    this.items.push(item);
    return item;
  }

  addTextItem() { return this._add('TEXT'); }
  addParagraphTextItem() { return this._add('PARAGRAPH_TEXT'); }
  addListItem() { return this._add('LIST'); }

  /**
   * Test helper: the dropdown's current values. Array.from, not slice:
   * the array came from the script's sandbox, and deepStrictEqual
   * never matches a sandbox array against a plain one.
   */
  choices() { return Array.from(this.getItems('LIST')[0].choices); }
}

class FakeFolder {
  constructor(drive, name, parent) {
    this.drive = drive;
    this.id = drive._newId('folder');
    this.name = name;
    this.parent = parent;
  }

  getId() { return this.id; }
  getName() { return this.name; }

  getFoldersByName(name) {
    return iterator(this.drive.folders.filter(f => f.parent === this && f.name === name));
  }

  createFolder(name) {
    const folder = new FakeFolder(this.drive, name, this);
    this.drive.folders.push(folder);
    return folder;
  }
}

function iterator(list) {
  let i = 0;
  return { hasNext: () => i < list.length, next: () => list[i++] };
}

/**
 * Everything the fakes know about, shared by every service. Tests read
 * it through ctx.$ to check what the script did.
 */
class FakeDrive {
  constructor() {
    this.counter = 0;
    this.forms = new Map();
    this.spreadsheets = new Map();
    this.folders = [];
    this.files = new Map(); // id -> {folder, sharing, trashed}
  }

  _newId(kind) { return kind + '-' + (++this.counter); }

  _register(obj) {
    this.files.set(obj.getId(), { folder: null, sharing: null, trashed: false });
    return obj;
  }

  _file(id) {
    const meta = this.files.get(id);
    if (!meta) throw new Error('Exception: No item with the given ID could be found: ' + id);
    return meta;
  }

  /** Test helper: delete a file outright, as if removed from Drive and Trash. */
  deleteFile(id) {
    this.files.delete(id);
    this.forms.delete(id);
    this.spreadsheets.delete(id);
  }

  /** Test helper: move a file to Trash. */
  trashFile(id) { this._file(id).trashed = true; }
}

/** Builds the whole global environment the script runs against. */
function buildEnvironment() {
  const drive = new FakeDrive();
  const logs = [];
  const errors = [];
  const sentMail = [];
  const triggers = [];
  const properties = {};

  const openForm = id => {
    const form = drive.forms.get(id);
    if (!form) throw new Error('Exception: No item with the given ID could be found: ' + id);
    return form;
  };
  const openSpreadsheet = id => {
    const ss = drive.spreadsheets.get(id);
    if (!ss) throw new Error('Exception: No item with the given ID could be found: ' + id);
    return ss;
  };

  const newTrigger = handler => {
    const trigger = { handler, sourceId: null, event: null };
    const builder = {
      forForm: form => { trigger.sourceId = form.getId(); return builder; },
      forSpreadsheet: ss => { trigger.sourceId = ss.getId(); return builder; },
      onFormSubmit: () => { trigger.event = 'ON_FORM_SUBMIT'; return builder; },
      onEdit: () => { trigger.event = 'ON_EDIT'; return builder; },
      create: () => {
        const created = {
          getHandlerFunction: () => trigger.handler,
          getTriggerSourceId: () => trigger.sourceId,
          getEventType: () => trigger.event,
          _info: trigger
        };
        triggers.push(created);
        return created;
      }
    };
    return builder;
  };

  const globals = {
    console: {
      error: m => { errors.push(String(m)); },
      log: m => { logs.push(String(m)); }
    },

    Logger: { log: m => { logs.push(String(m)); } },

    Session: { getScriptTimeZone: () => 'America/Chicago' },

    Utilities: {
      formatDate,
      newBlob: (content, type, name) => ({ content, type, name }),
      getUuid: () => 'fake-uuid'
    },

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (Object.prototype.hasOwnProperty.call(properties, k) ? properties[k] : null),
        setProperty: (k, v) => { properties[k] = String(v); },
        deleteProperty: k => { delete properties[k]; },
        getProperties: () => Object.assign({}, properties)
      })
    },

    FormApp: {
      create: title => {
        const form = drive._register(new FakeForm(drive, title));
        drive.forms.set(form.getId(), form);
        return form;
      },
      openById: openForm,
      ItemType: { LIST: 'LIST', TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT' },
      DestinationType: { SPREADSHEET: 'SPREADSHEET' },
      createTextValidation: () => {
        const v = {
          requireTextIsEmail: () => v,
          requireTextMatchesPattern: () => v,
          build: () => ({})
        };
        return v;
      }
    },

    SpreadsheetApp: {
      create: name => {
        const ss = drive._register(new FakeSpreadsheet(drive, name));
        drive.spreadsheets.set(ss.getId(), ss);
        return ss;
      },
      openById: openSpreadsheet,
      newRichTextValue: () => {
        let text = '';
        const builder = {
          setText: t => { text = t; return builder; },
          // The real API rejects an empty or out-of-bounds range with
          // "Illegal argument", which is what happens when the name
          // being written is blank. Validate, or this fake hides it.
          setTextStyle: (start, end) => {
            if (typeof start !== 'number' || typeof end !== 'number' ||
                start < 0 || end > text.length || start >= end) {
              throw new Error('Exception: Illegal argument.');
            }
            return builder;
          },
          build: () => ({ getText: () => text })
        };
        return builder;
      },
      newTextStyle: () => ({ setBold: () => ({ build: () => ({}) }) })
    },

    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => {
        const i = triggers.indexOf(t);
        if (i !== -1) triggers.splice(i, 1);
      },
      newTrigger
    },

    MailApp: { sendEmail: msg => { sentMail.push(msg); } },

    DriveApp: {
      getFileById: id => {
        const meta = drive._file(id);
        return {
          getId: () => id,
          isTrashed: () => meta.trashed,
          moveTo: folder => { meta.folder = folder; },
          setSharing: (access, permission) => { meta.sharing = access + ':' + permission; }
        };
      },
      getFoldersByName: name =>
        iterator(drive.folders.filter(f => f.parent === null && f.name === name)),
      createFolder: name => {
        const folder = new FakeFolder(drive, name, null);
        drive.folders.push(folder);
        return folder;
      },
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' }
    }
  };

  return { globals, drive, logs, errors, sentMail, triggers, properties };
}

module.exports = { GREEN, formatDate, buildEnvironment };
