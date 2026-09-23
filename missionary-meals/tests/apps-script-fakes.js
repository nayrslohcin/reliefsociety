'use strict';
/**
 * Stand-ins for the Google Apps Script services that
 * missionary-meal-signup.gs calls, good enough to run the real script
 * under Node.
 *
 * Only the behaviour the script actually depends on is modelled:
 * cell values, cell backgrounds, dropdown choices, whether the form is
 * accepting responses, and which triggers exist. Everything else
 * (fonts, borders, row heights) is a chainable no-op, because nothing
 * ever reads it back.
 *
 * Two things here are load-bearing and must not be "simplified":
 *  - Utilities.formatDate must produce byte-identical output to the
 *    real one for the patterns the script uses. Those strings are the
 *    keys of SCHEDULE_MAP, so a formatting difference would make the
 *    fakes agree with themselves and disagree with production.
 *  - A cell's background colour, specifically '#93c47d', is how
 *    greyOutPastDates() recognises a square someone claimed.
 */

const GREEN = '#93c47d';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * Utilities.formatDate for the patterns this script uses:
 * 'EEEE, MMMM d, yyyy', 'yyyy-MM-dd', 'yyyy-MM', 'MMMM yyyy' and
 * "yyyyMMdd'T'HHmmss'Z'". Time zone is ignored — tests construct dates
 * in the host zone and the script's own getDay()/getHours() calls read
 * them back the same way, exactly as Apps Script does with the project
 * time zone.
 */
function formatDate(date, _tz, pattern) {
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
      out.push(token(date, ch, run, pattern));
      i += run;
      continue;
    }

    out.push(ch);
    i++;
  }
  return out.join('');
}

function token(d, ch, run, pattern) {
  switch (ch) {
    case 'y': return run <= 2 ? pad(d.getFullYear() % 100, 2) : String(d.getFullYear());
    case 'M': return run >= 4 ? MONTHS[d.getMonth()]
      : run === 3 ? MONTHS[d.getMonth()].slice(0, 3)
      : pad(d.getMonth() + 1, run);
    case 'd': return pad(d.getDate(), run);
    case 'E': return run >= 4 ? DAYS[d.getDay()] : DAYS[d.getDay()].slice(0, 3);
    case 'H': return pad(d.getHours(), run);
    case 'm': return pad(d.getMinutes(), run);
    case 's': return pad(d.getSeconds(), run);
    case 'u': return String(d.getDay() === 0 ? 7 : d.getDay());
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
  // back with getValue() to recover the day number — so the plain
  // value has to follow the rich text.
  setRichTextValue(rich) { return this.setValue(rich.getText()); }

  merge() { return this; }
}

class FakeSheet {
  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this.cells = new Map(); // 'row,col' -> {value, background}
  }

  _key(row, col) { return row + ',' + col; }

  _cell(row, col) {
    const key = this._key(row, col);
    if (!this.cells.has(key)) this.cells.set(key, { value: '', background: '#ffffff' });
    return this.cells.get(key);
  }

  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getParent() { return this.parent; }
  getRange(row, col, numRows, numCols) { return new FakeRange(this, row, col, numRows, numCols); }
  setRowHeight() { return this; }
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

  deleteRow(row) { return this.deleteRows(row, 1); }

  /** Deletes rows and shifts everything below up, like the real thing. */
  deleteRows(start, howMany) {
    const next = new Map();
    for (const [key, cell] of this.cells) {
      const [r, c] = key.split(',').map(Number);
      if (r >= start && r < start + howMany) continue;         // deleted
      const newRow = r >= start + howMany ? r - howMany : r;   // shifted up
      next.set(newRow + ',' + c, cell);
    }
    this.cells = next;
    return this;
  }
}

class FakeSpreadsheet {
  constructor(name, sheetNames) {
    this.name = name;
    this.sheets = (sheetNames || ['Sheet1']).map(n => new FakeSheet(n, this));
  }

  getName() { return this.name; }
  getId() { return 'ss-' + this.name; }
  getUrl() { return 'https://example.test/' + this.getId(); }
  getSheets() { return this.sheets.slice(); }
  getActiveSheet() { return this.sheets[0]; }
  getSheetByName(name) { return this.sheets.find(s => s.getName() === name) || null; }

  insertSheet(name) {
    const sheet = new FakeSheet(name, this);
    this.sheets.push(sheet);
    return sheet;
  }
}

class FakeListItem {
  constructor(form, title) {
    this.form = form;
    this.title = title;
    this.id = 'list-1';
  }

  getId() { return this.id; }
  getTitle() { return this.title; }
  setTitle(t) { this.title = t; return this; }
  setRequired() { return this; }
  asListItem() { return this; }
  getType() { return 'LIST'; }
  getChoices() { return this.form.choices.map(v => ({ getValue: () => v })); }
  setChoiceValues(values) { this.form.choices = values.slice(); return this; }
}

class FakeTextItem {
  constructor(title) {
    this.title = title;
    this.required = false;
    this.id = 'text-' + title;
  }

  getId() { return this.id; }
  getTitle() { return this.title; }
  setTitle(t) { this.title = t; return this; }
  isRequired() { return this.required; }
  setRequired(v) { this.required = v; return this; }
  setValidation() { return this; }
  asTextItem() { return this; }
  getType() { return 'TEXT'; }
}

class FakeForm {
  constructor(options) {
    const opts = options || {};
    this.choices = (opts.choices || []).slice();
    this.accepting = opts.accepting !== false;
    this.closedMessage = opts.closedMessage || '';
    this.description = '';
    this.textItems = (opts.textItems || []).map(t =>
      Object.assign(new FakeTextItem(t.title), { required: !!t.required }));
    this.listItem = new FakeListItem(this, 'Choose a date');
  }

  getId() { return 'form-1'; }
  getUrl() { return 'https://example.test/edit'; }
  getEditUrl() { return this.getUrl(); }
  getPublishedUrl() { return 'https://example.test/view'; }
  getName() { return 'Fake Form'; }
  setDescription(d) { this.description = d; return this; }
  setLimitOneResponsePerUser() { return this; }
  setDestination() { return this; }
  isAcceptingResponses() { return this.accepting; }
  setAcceptingResponses(v) { this.accepting = v; return this; }
  getCustomClosedFormMessage() { return this.closedMessage; }
  setCustomClosedFormMessage(m) { this.closedMessage = m; return this; }

  getItems(type) {
    if (type === 'LIST') return [this.listItem];
    if (type === 'TEXT') return this.textItems;
    return this.textItems.concat([this.listItem]);
  }

  addTextItem() {
    const item = new FakeTextItem('');
    this.textItems.push(item);
    return item;
  }

  addListItem() { return this.listItem; }
}

/** Builds the whole global environment the script runs against. */
function buildEnvironment(options) {
  const opts = options || {};
  const logs = [];
  const sentMail = [];
  const triggers = (opts.triggers || []).map(handler => ({
    getHandlerFunction: () => handler,
    getEventType: () => 'unknown'
  }));
  const deletedTriggers = [];

  const form = opts.form || new FakeForm(opts);
  const properties = Object.assign({}, opts.properties);

  const spreadsheets = opts.spreadsheets || {};

  const env = {
    logs: logs,
    sentMail: sentMail,
    triggers: triggers,
    deletedTriggers: deletedTriggers,
    form: form,
    properties: properties,
    spreadsheets: spreadsheets,

    globals: {
      console: { error: m => logs.push('ERROR ' + m), log: m => logs.push(String(m)) },

      Logger: { log: m => logs.push(String(m)) },

      Session: { getScriptTimeZone: () => opts.timeZone || 'America/Chicago' },

      Utilities: {
        formatDate: formatDate,
        newBlob: (content, type, name) => ({ content, type, name }),
        getUuid: () => 'fake-uuid'
      },

      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: k => (k in properties ? properties[k] : null),
          setProperty: (k, v) => { properties[k] = v; },
          getProperties: () => Object.assign({}, properties)
        })
      },

      FormApp: {
        openById: () => form,
        create: () => form,
        ItemType: { LIST: 'LIST', TEXT: 'TEXT' },
        DestinationType: { SPREADSHEET: 'SPREADSHEET' },
        createTextValidation: () => ({
          requireTextIsEmail: () => ({ build: () => ({}) })
        })
      },

      SpreadsheetApp: {
        openById: id => spreadsheets[id],
        create: name => new FakeSpreadsheet(name),
        newRichTextValue: () => {
          let text = '';
          const builder = {
            setText: t => { text = t; return builder; },
            setTextStyle: () => builder,
            build: () => ({ getText: () => text })
          };
          return builder;
        },
        newTextStyle: () => ({ setBold: () => ({ build: () => ({}) }) })
      },

      ScriptApp: {
        getProjectTriggers: () => triggers.slice(),
        deleteTrigger: t => {
          deletedTriggers.push(t.getHandlerFunction());
          const i = triggers.indexOf(t);
          if (i !== -1) triggers.splice(i, 1);
        },
        newTrigger: handler => {
          const created = { getHandlerFunction: () => handler, getEventType: () => 'time' };
          const builder = {
            timeBased: () => builder,
            forForm: () => builder,
            forSpreadsheet: () => builder,
            onFormSubmit: () => builder,
            onEdit: () => builder,
            everyMinutes: () => builder,
            everyDays: () => builder,
            atHour: () => builder,
            create: () => { triggers.push(created); return created; }
          };
          return builder;
        }
      },

      MailApp: { sendEmail: msg => { sentMail.push(msg); } },

      DriveApp: {
        getFileById: () => ({ moveTo: () => {}, setSharing: () => {}, getName: () => 'file', getUrl: () => 'u', isTrashed: () => false }),
        getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
        createFolder: name => ({ getName: () => name, getFilesByType: () => ({ hasNext: () => false }) }),
        Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
        Permission: { VIEW: 'VIEW' }
      },

      MimeType: { GOOGLE_FORMS: 'GOOGLE_FORMS' }
    }
  };

  return env;
}

module.exports = {
  GREEN,
  formatDate,
  FakeForm,
  FakeSheet,
  FakeSpreadsheet,
  buildEnvironment
};
