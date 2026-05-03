/**
 * Water Benders IITH – Google Apps Script Backend
 *
 * SETUP:
 * 1. Create a new Google Spreadsheet.
 * 2. Open Extensions → Apps Script, paste this code.
 * 3. Add a row in the "Settings" sheet: column A = "admin_passcode", column B = your chosen passcode.
 * 4. Deploy → New deployment → Web app
 *    Execute as: Me | Access: Anyone (even anonymous)
 * 5. Copy the deployment URL into js/config.js → APPS_SCRIPT_URL
 */

// Sheet names
const SHEET = {
  BOWLS:    'Bowls',
  BENDERS:  'WaterBenders',
  HISTORY:  'FillHistory',
  SETTINGS: 'Settings',
};

// Column definitions (must match initSheet order)
const BOWL_COLS    = ['id','name','description','latitude','longitude','location_name','photo_url','timer_hours','last_filled','last_filled_by','created_at','created_by','is_active'];
const BENDER_COLS  = ['id','bowl_id','name','phone','created_at'];
const HISTORY_COLS = ['id','bowl_id','filled_by','timestamp','notes'];
const SETTING_COLS = ['key','value'];

// ── Routing ────────────────────────────────────────────

function doGet(e) {
  const params = e.parameter || {};
  let result;
  try {
    switch (params.action) {
      case 'ping':       result = { status: 'ok', ts: new Date().toISOString() }; break;
      case 'getBowls':   result = getBowls(); break;
      case 'getBenders': result = getBenders(params.bowlId); break;
      case 'getHistory': result = getHistory(params.bowlId, parseInt(params.limit) || 10); break;
      default:           result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  const json = JSON.stringify(result);

  // JSONP: if a callback name is provided, wrap the response so a <script>
  // tag can receive it without any CORS restrictions.
  if (params.callback) {
    return ContentService
      .createTextOutput(`${params.callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    let result;
    switch (data.action) {
      case 'addBowl':      result = addBowl(data); break;
      case 'updateBowl':   result = updateBowl(data); break;
      case 'deleteBowl':   result = deleteBowl(data.id); break;
      case 'fillBowl':     result = fillBowl(data); break;
      case 'addBender':    result = addBender(data); break;
      case 'removeBender': result = removeBender(data.id); break;
      case 'uploadImage':  result = uploadImage(data); break;
      case 'verifyAdmin':  result = verifyAdmin(data.passcode); break;
      default:             result = { error: 'Unknown action' };
    }
    return respond(result);
  } catch (err) {
    return respond({ error: err.message });
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sheet helpers ──────────────────────────────────────

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name, headers) {
  let sheet = ss().getSheetByName(name);
  if (!sheet) {
    sheet = ss().insertSheet(name);
    const hRow = sheet.getRange(1, 1, 1, headers.length);
    hRow.setValues([headers]);
    hRow.setFontWeight('bold').setBackground('#e0f2fe');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToObjects(sheet, cols) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).filter(r => r[0] !== '').map(r => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = r[i]; });
    return obj;
  });
}

function generateId() { return Utilities.getUuid(); }

// ── Bowls ──────────────────────────────────────────────

function getBowls() {
  const sheet = getSheet(SHEET.BOWLS, BOWL_COLS);
  return sheetToObjects(sheet, BOWL_COLS)
    .filter(b => b.is_active === true || b.is_active === 'TRUE');
}

function addBowl(d) {
  const sheet = getSheet(SHEET.BOWLS, BOWL_COLS);
  const id = generateId();
  const now = new Date().toISOString();
  sheet.appendRow([
    id, d.name || '', d.description || '',
    d.latitude || 0, d.longitude || 0, d.location_name || '',
    d.photo_url || '', d.timer_hours || 8,
    '', '',   // last_filled, last_filled_by
    now, d.created_by || 'Anonymous', true,
  ]);
  return { success: true, id };
}

function updateBowl(d) {
  const sheet = getSheet(SHEET.BOWLS, BOWL_COLS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === d.id) {
      const rn = i + 1;
      const setCol = (col, val) => {
        if (val === undefined) return;
        const ci = BOWL_COLS.indexOf(col);
        if (ci >= 0) sheet.getRange(rn, ci + 1).setValue(val);
      };
      ['name','description','latitude','longitude','location_name','photo_url','timer_hours'].forEach(col => setCol(col, d[col]));
      return { success: true };
    }
  }
  return { error: 'Bowl not found' };
}

function deleteBowl(id) {
  const sheet = getSheet(SHEET.BOWLS, BOWL_COLS);
  const rows = sheet.getDataRange().getValues();
  const ci = BOWL_COLS.indexOf('is_active');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.getRange(i + 1, ci + 1).setValue(false);
      return { success: true };
    }
  }
  return { error: 'Bowl not found' };
}

function fillBowl(d) {
  const sheet = getSheet(SHEET.BOWLS, BOWL_COLS);
  const rows = sheet.getDataRange().getValues();
  const lfIdx  = BOWL_COLS.indexOf('last_filled');
  const lfbIdx = BOWL_COLS.indexOf('last_filled_by');
  const now = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === d.bowlId) {
      sheet.getRange(i + 1, lfIdx  + 1).setValue(now);
      sheet.getRange(i + 1, lfbIdx + 1).setValue(d.filledBy || 'Anonymous');

      // History
      const hSheet = getSheet(SHEET.HISTORY, HISTORY_COLS);
      hSheet.appendRow([generateId(), d.bowlId, d.filledBy || 'Anonymous', now, d.notes || '']);

      return { success: true, timestamp: now };
    }
  }
  return { error: 'Bowl not found' };
}

// ── Water Benders ──────────────────────────────────────

function getBenders(bowlId) {
  const sheet = getSheet(SHEET.BENDERS, BENDER_COLS);
  const all = sheetToObjects(sheet, BENDER_COLS);
  return bowlId ? all.filter(b => b.bowl_id === bowlId) : all;
}

function addBender(d) {
  const sheet = getSheet(SHEET.BENDERS, BENDER_COLS);
  const id = generateId();
  sheet.appendRow([id, d.bowl_id, d.name, d.phone || '', new Date().toISOString()]);
  return { success: true, id };
}

function removeBender(id) {
  const sheet = getSheet(SHEET.BENDERS, BENDER_COLS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { error: 'Bender not found' };
}

// ── Fill History ───────────────────────────────────────

function getHistory(bowlId, limit) {
  const sheet = getSheet(SHEET.HISTORY, HISTORY_COLS);
  let rows = sheetToObjects(sheet, HISTORY_COLS);
  if (bowlId) rows = rows.filter(r => r.bowl_id === bowlId);
  rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return limit ? rows.slice(0, limit) : rows;
}

// ── Image Upload ───────────────────────────────────────

function uploadImage(d) {
  try {
    const parts   = d.imageData.split(',');
    const b64     = parts.length > 1 ? parts[1] : parts[0];
    const bytes   = Utilities.base64Decode(b64);
    const blob    = Utilities.newBlob(bytes, d.mimeType || 'image/jpeg', d.fileName || 'bowl.jpg');

    const folderName = 'Water Benders IITH Photos';
    const iter  = DriveApp.getFoldersByName(folderName);
    const folder = iter.hasNext() ? iter.next() : DriveApp.createFolder(folderName);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      url: `https://drive.google.com/uc?export=view&id=${file.getId()}`,
      fileId: file.getId(),
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ── Admin ──────────────────────────────────────────────

function verifyAdmin(passcode) {
  try {
    const sheet = getSheet(SHEET.SETTINGS, SETTING_COLS);
    const rows  = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === 'admin_passcode') {
        return { authorized: String(rows[i][1]) === String(passcode) };
      }
    }
    // First-time: no passcode set yet – add default and return false
    sheet.appendRow(['admin_passcode', 'changeme123']);
    return { authorized: false, hint: 'Default passcode set to: changeme123 — change it in the Settings sheet!' };
  } catch (err) {
    return { error: err.message };
  }
}
