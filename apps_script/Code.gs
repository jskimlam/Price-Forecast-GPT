/**
 * Price-Forecast-GPT / Apps Script backend
 * Bound to Google Sheet: Price-Forecast-GPT_DB
 *
 * Required Script Properties:
 *   ADMIN_PASSWORD  : admin login password (required)
 *   GITHUB_TOKEN    : fine-grained PAT with Actions: Read and write (required for forecast dispatch)
 *
 * Created automatically by setupProject():
 *   GITHUB_REPO     : jskimlam/Price-Forecast-GPT
 *   GITHUB_WORKFLOW : forecast.yml
 *   DATA_API_KEY    : private Sheet API key for GitHub Actions
 *   SESSION_SECRET  : session signing secret
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 */

const APP = Object.freeze({
  NAME: 'PETROCHEM FORECAST ENGINE',
  VERSION: '1.0.0',
  PRICE_SHEET: 'prices',
  VARIABLES_SHEET: 'variables',
  TARGETS_SHEET: 'targets',
  FORECAST_SHEET: 'forecast_history',
  ACTUAL_SHEET: 'actual_vs_forecast',
  SCORE_SHEET: 'model_score',
  SETTINGS_SHEET: 'settings',
  META_ROWS: 5,
  DATA_START_ROW: 6,
  DEFAULT_REPO: 'jskimlam/Price-Forecast-GPT',
  DEFAULT_WORKFLOW: 'forecast.yml',
  SESSION_SECONDS: 21600, // 6h
});

function setupProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Seoul');

  ensureSheet_(APP.PRICE_SHEET, 2000, 30);
  ensureSheet_(APP.VARIABLES_SHEET, 100, 8);
  ensureSheet_(APP.TARGETS_SHEET, 100, 8);
  ensureSheet_(APP.FORECAST_SHEET, 5000, 16);
  ensureSheet_(APP.ACTUAL_SHEET, 5000, 12);
  ensureSheet_(APP.SCORE_SHEET, 1000, 12);
  ensureSheet_(APP.SETTINGS_SHEET, 200, 8);

  ensureHeaders_(APP.FORECAST_SHEET, [
    'generated_at','as_of_date','code','label','horizon','current_price',
    'forecast_price','low_80','high_80','prob_up','prob_flat','prob_down',
    'confidence','signal','model_version','run_id'
  ]);
  ensureHeaders_(APP.ACTUAL_SHEET, [
    'run_id','as_of_date','target_date','code','horizon','forecast_price',
    'actual_price','error','abs_error','direction_hit','brier_score','evaluated_at'
  ]);
  ensureHeaders_(APP.SCORE_SHEET, [
    'updated_at','code','horizon','sample_count','direction_accuracy',
    'mae','mape','brier_score','interval_coverage','skill_score','model_version','note'
  ]);

  const props = PropertiesService.getScriptProperties();
  const defaults = {};
  if (!props.getProperty('GITHUB_REPO')) defaults.GITHUB_REPO = APP.DEFAULT_REPO;
  if (!props.getProperty('GITHUB_WORKFLOW')) defaults.GITHUB_WORKFLOW = APP.DEFAULT_WORKFLOW;
  if (!props.getProperty('DATA_API_KEY')) defaults.DATA_API_KEY = makeSecret_();
  if (!props.getProperty('SESSION_SECRET')) defaults.SESSION_SECRET = makeSecret_();
  if (Object.keys(defaults).length) props.setProperties(defaults, false);

  const result = {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    githubRepo: props.getProperty('GITHUB_REPO') || APP.DEFAULT_REPO,
    githubWorkflow: props.getProperty('GITHUB_WORKFLOW') || APP.DEFAULT_WORKFLOW,
    adminPasswordConfigured: !!props.getProperty('ADMIN_PASSWORD'),
    githubTokenConfigured: !!props.getProperty('GITHUB_TOKEN'),
    dataApiKey: props.getProperty('DATA_API_KEY'),
    version: APP.VERSION
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api) return handleDataApiGet_(p);

  const t = HtmlService.createTemplateFromFile('admin');
  t.appName = APP.NAME;
  t.version = APP.VERSION;
  return t.evaluate()
    .setTitle(APP.NAME + ' · Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const key = String(body.api_key || (e && e.parameter && e.parameter.key) || '');
    assertDataApiKey_(key);

    switch (String(body.action || '')) {
      case 'ping':
        return json_({ok:true, app:APP.NAME, version:APP.VERSION, at:new Date().toISOString()});
      case 'append_forecasts':
        return json_(appendObjects_(APP.FORECAST_SHEET, body.rows || []));
      case 'append_actuals':
        return json_(appendObjects_(APP.ACTUAL_SHEET, body.rows || []));
      case 'replace_scores':
        return json_(replaceObjects_(APP.SCORE_SHEET, body.rows || []));
      default:
        return json_({ok:false, error:'Unknown action'}, 400);
    }
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)}, 500);
  }
}

/* =========================
 * Admin API
 * ========================= */

function apiLogin(password) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) throw new Error('ADMIN_PASSWORD가 설정되지 않았습니다. Script Properties에 먼저 등록하세요.');
  if (!safeEqual_(String(password || ''), expected)) {
    Utilities.sleep(350);
    throw new Error('비밀번호가 올바르지 않습니다.');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('sess:' + token, '1', APP.SESSION_SECONDS);
  return {ok:true, token:token, expiresIn:APP.SESSION_SECONDS};
}

function apiLogout(token) {
  if (token) CacheService.getScriptCache().remove('sess:' + token);
  return {ok:true};
}

function apiBootstrap(token) {
  assertSession_(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const price = ss.getSheetByName(APP.PRICE_SHEET);
  const variables = readObjectTable_(APP.VARIABLES_SHEET);
  const targets = readObjectTable_(APP.TARGETS_SHEET);
  const settings = readSettings_();
  const dates = getRecentDates_(price, 30);
  const latestDate = dates.length ? dates[0] : '';
  const snapshot = latestDate ? getPriceSnapshot_(latestDate) : {date:'', values:{}};
  const props = PropertiesService.getScriptProperties();

  return {
    ok: true,
    app: APP.NAME,
    version: APP.VERSION,
    spreadsheetName: ss.getName(),
    variables,
    targets,
    settings,
    recentDates: dates,
    latestDate,
    snapshot,
    integrations: {
      githubRepo: props.getProperty('GITHUB_REPO') || APP.DEFAULT_REPO,
      githubWorkflow: props.getProperty('GITHUB_WORKFLOW') || APP.DEFAULT_WORKFLOW,
      githubTokenConfigured: !!props.getProperty('GITHUB_TOKEN'),
      dataApiKeyConfigured: !!props.getProperty('DATA_API_KEY')
    }
  };
}

function apiLoadDate(token, dateText) {
  assertSession_(token);
  return getPriceSnapshot_(normalizeDateText_(dateText));
}

function apiSavePrices(token, payload) {
  assertSession_(token);
  const result = savePriceSnapshot_(payload || {});
  return {ok:true, ...result};
}

function apiRunForecast(token) {
  assertSession_(token);
  return dispatchForecast_('admin_manual');
}

function apiSaveAndRun(token, payload) {
  assertSession_(token);
  const saved = savePriceSnapshot_(payload || {});
  let dispatch;
  try {
    dispatch = dispatchForecast_('admin_save');
  } catch (err) {
    dispatch = {ok:false, error:String(err && err.message || err)};
  }
  return {ok:true, saved, dispatch};
}

function apiIntegrationStatus(token) {
  assertSession_(token);
  const p = PropertiesService.getScriptProperties();
  return {
    ok:true,
    adminPasswordConfigured:!!p.getProperty('ADMIN_PASSWORD'),
    githubTokenConfigured:!!p.getProperty('GITHUB_TOKEN'),
    githubRepo:p.getProperty('GITHUB_REPO') || APP.DEFAULT_REPO,
    githubWorkflow:p.getProperty('GITHUB_WORKFLOW') || APP.DEFAULT_WORKFLOW,
    dataApiKeyConfigured:!!p.getProperty('DATA_API_KEY')
  };
}

/* =========================
 * Private data API for GitHub Actions
 * ========================= */

function handleDataApiGet_(p) {
  try {
    assertDataApiKey_(String(p.key || ''));
    const api = String(p.api || '');

    if (api === 'health') {
      return json_({ok:true, app:APP.NAME, version:APP.VERSION, at:new Date().toISOString()});
    }

    if (api === 'config') {
      return json_({
        ok:true,
        variables:readObjectTable_(APP.VARIABLES_SHEET),
        targets:readObjectTable_(APP.TARGETS_SHEET),
        settings:readSettings_()
      });
    }

    if (api === 'prices') {
      const limit = Math.max(0, Math.min(Number(p.limit || 0), 5000));
      return json_(exportPrices_(limit));
    }

    if (api === 'latest') {
      const price = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.PRICE_SHEET);
      const dates = getRecentDates_(price, 1);
      return json_(dates.length ? getPriceSnapshot_(dates[0]) : {date:'',values:{}});
    }

    if (api === 'forecast_history') {
      const limit = Math.max(1, Math.min(Number(p.limit || 500), 5000));
      return json_({ok:true, rows:readObjectTable_(APP.FORECAST_SHEET, limit)});
    }

    return json_({ok:false, error:'Unknown api'}, 400);
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)}, 500);
  }
}

function exportPrices_(limit) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.PRICE_SHEET);
  if (!sh) throw new Error('prices 시트를 찾을 수 없습니다.');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < APP.DATA_START_ROW || lastCol < 2) return {ok:true, meta:{}, rows:[]};

  const codes = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const labels = sh.getRange(2, 1, 1, lastCol).getDisplayValues()[0];
  const units = sh.getRange(3, 1, 1, lastCol).getDisplayValues()[0];
  const currencies = sh.getRange(4, 1, 1, lastCol).getDisplayValues()[0];
  const types = sh.getRange(5, 1, 1, lastCol).getDisplayValues()[0];

  let count = lastRow - APP.DATA_START_ROW + 1;
  if (limit > 0) count = Math.min(count, limit);
  const vals = sh.getRange(APP.DATA_START_ROW, 1, count, lastCol).getValues();

  const rows = vals
    .filter(r => r[0] instanceof Date || String(r[0] || '').trim())
    .map(r => {
      const obj = {date:dateToText_(r[0])};
      for (let c=1; c<lastCol; c++) {
        const code = String(codes[c] || '').trim();
        if (!code) continue;
        const v = r[c];
        obj[code] = (v === '' || v === null) ? null : Number(v);
      }
      return obj;
    });

  return {
    ok:true,
    meta:{
      codes, labels, units, currencies, types,
      dataStartRow:APP.DATA_START_ROW,
      order:'latest_first'
    },
    rows
  };
}

/* =========================
 * Price sheet helpers
 * ========================= */

function savePriceSnapshot_(payload) {
  const dateText = normalizeDateText_(payload.date);
  if (!dateText) throw new Error('평가일자를 입력하세요.');

  const values = payload.values || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(APP.PRICE_SHEET);
  if (!sh) throw new Error('prices 시트를 찾을 수 없습니다.');

  const lastCol = sh.getLastColumn();
  const codes = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(x => String(x || '').trim());
  const codeToCol = {};
  for (let c=1; c<codes.length; c++) if (codes[c]) codeToCol[codes[c]] = c + 1;

  let row = findDateRow_(sh, dateText);
  let created = false;
  if (!row) {
    row = Math.max(sh.getLastRow() + 1, APP.DATA_START_ROW);
    sh.getRange(row, 1).setValue(parseDate_(dateText)).setNumberFormat('yyyy-mm-dd');
    created = true;
  }

  const existing = sh.getRange(row, 1, 1, lastCol).getValues()[0];
  existing[0] = parseDate_(dateText);

  Object.keys(values).forEach(code => {
    const col = codeToCol[code];
    if (!col) return;
    const raw = values[code];
    existing[col - 1] = (raw === '' || raw === null || typeof raw === 'undefined')
      ? ''
      : toFiniteNumber_(raw, code);
  });

  sh.getRange(row, 1, 1, lastCol).setValues([existing]);
  sh.getRange(row, 1).setNumberFormat('yyyy-mm-dd');

  // Keep newest assessment date at the top while preserving the 5 metadata rows.
  const dataRows = sh.getLastRow() - APP.DATA_START_ROW + 1;
  if (dataRows > 1) {
    sh.getRange(APP.DATA_START_ROW, 1, dataRows, lastCol)
      .sort([{column:1, ascending:false}]);
  }

  SpreadsheetApp.flush();
  return {date:dateText, created, updatedCodes:Object.keys(values).filter(k => codeToCol[k]).length};
}

function getPriceSnapshot_(dateText) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.PRICE_SHEET);
  if (!sh) throw new Error('prices 시트를 찾을 수 없습니다.');
  const row = findDateRow_(sh, dateText);
  if (!row) return {ok:true, date:dateText, exists:false, values:{}};

  const lastCol = sh.getLastColumn();
  const codes = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const vals = sh.getRange(row, 1, 1, lastCol).getValues()[0];
  const values = {};
  for (let c=1; c<lastCol; c++) {
    const code = String(codes[c] || '').trim();
    if (!code) continue;
    values[code] = (vals[c] === '' || vals[c] === null) ? '' : vals[c];
  }
  return {ok:true, date:dateToText_(vals[0]), exists:true, values};
}

function findDateRow_(sh, dateText) {
  const lastRow = sh.getLastRow();
  if (lastRow < APP.DATA_START_ROW) return 0;
  const range = sh.getRange(APP.DATA_START_ROW, 1, lastRow - APP.DATA_START_ROW + 1, 1);
  const found = range.createTextFinder(dateText).matchEntireCell(true).findNext();
  if (found) return found.getRow();

  // Date cells may be numeric dates; display-value fallback.
  const display = range.getDisplayValues();
  for (let i=0; i<display.length; i++) {
    if (String(display[i][0]).trim() === dateText) return APP.DATA_START_ROW + i;
  }
  return 0;
}

function getRecentDates_(sh, count) {
  const lastRow = sh.getLastRow();
  if (lastRow < APP.DATA_START_ROW) return [];
  const n = Math.min(lastRow - APP.DATA_START_ROW + 1, Math.max(count * 2, count));
  const vals = sh.getRange(APP.DATA_START_ROW, 1, n, 1).getValues().flat();
  return vals.map(dateToText_).filter(Boolean).slice(0, count);
}

/* =========================
 * GitHub Actions
 * ========================= */

function dispatchForecast_(reason) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('GITHUB_TOKEN');
  const repo = p.getProperty('GITHUB_REPO') || APP.DEFAULT_REPO;
  const workflow = p.getProperty('GITHUB_WORKFLOW') || APP.DEFAULT_WORKFLOW;
  if (!token) throw new Error('GITHUB_TOKEN이 Script Properties에 설정되지 않았습니다.');

  const url = 'https://api.github.com/repos/' + repo + '/actions/workflows/' +
    encodeURIComponent(workflow) + '/dispatches';

  const payload = {
    ref: 'main',
    inputs: {
      reason: String(reason || 'admin_manual'),
      requested_at: new Date().toISOString()
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method:'post',
    muteHttpExceptions:true,
    contentType:'application/json',
    headers:{
      Authorization:'Bearer ' + token,
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28'
    },
    payload:JSON.stringify(payload)
  });

  const status = res.getResponseCode();
  const body = res.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('GitHub Actions 실행 실패 (' + status + '): ' + body);
  }
  return {ok:true, status, repo, workflow};
}

/* =========================
 * Result writers
 * ========================= */

function appendObjects_(sheetName, objects) {
  if (!Array.isArray(objects) || !objects.length) return {ok:true, appended:0};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error(sheetName + ' 시트를 찾을 수 없습니다.');
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].filter(Boolean);
  if (!headers.length) throw new Error(sheetName + ' 헤더가 없습니다.');
  const rows = objects.map(obj => headers.map(h => normalizeCellValue_(obj[h])));
  sh.getRange(sh.getLastRow()+1,1,rows.length,headers.length).setValues(rows);
  return {ok:true, appended:rows.length};
}

function replaceObjects_(sheetName, objects) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error(sheetName + ' 시트를 찾을 수 없습니다.');
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].filter(Boolean);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2,1,last-1,sh.getLastColumn()).clearContent();
  if (!Array.isArray(objects) || !objects.length) return {ok:true, replaced:0};
  const rows = objects.map(obj => headers.map(h => normalizeCellValue_(obj[h])));
  sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  return {ok:true, replaced:rows.length};
}

/* =========================
 * Generic helpers
 * ========================= */

function readObjectTable_(sheetName, limit) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return [];
  const lastRow = limit ? Math.min(sh.getLastRow(), Number(limit)+1) : sh.getLastRow();
  const data = sh.getRange(1,1,lastRow,sh.getLastColumn()).getValues();
  const headers = data.shift().map(x => String(x || '').trim());
  return data
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => {
      const o = {};
      headers.forEach((h,i) => { if (h) o[h] = serializeValue_(r[i]); });
      return o;
    });
}

function readSettings_() {
  const rows = readObjectTable_(APP.SETTINGS_SHEET);
  const out = {};
  rows.forEach(r => {
    if (r.key !== '' && r.key != null) out[String(r.key)] = r.value;
  });
  return out;
}

function ensureSheet_(name, rows, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  sh.setFrozenRows(1);
  return sh;
}

function ensureHeaders_(sheetName, headers) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const current = sh.getRange(1,1,1,headers.length).getDisplayValues()[0];
  const empty = current.every(v => !String(v || '').trim());
  if (empty) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight('bold')
      .setBackground('#e8edf5');
    sh.setFrozenRows(1);
  }
}

function assertSession_(token) {
  if (!token || CacheService.getScriptCache().get('sess:' + token) !== '1') {
    throw new Error('SESSION_EXPIRED');
  }
}

function assertDataApiKey_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('DATA_API_KEY');
  if (!expected || !key || !safeEqual_(String(key), String(expected))) {
    throw new Error('Unauthorized');
  }
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0; i<a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function makeSecret_() {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid() + new Date().getTime()
    )
  ).replace(/=+$/,'');
}

function normalizeDateText_(v) {
  if (v instanceof Date) return dateToText_(v);
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('날짜 형식은 YYYY-MM-DD 이어야 합니다.');
  return s;
}

function parseDate_(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}

function dateToText_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : s;
}

function toFiniteNumber_(v, code) {
  const n = Number(String(v).replace(/,/g,''));
  if (!isFinite(n)) throw new Error(code + ' 값이 숫자가 아닙니다.');
  return n;
}

function normalizeCellValue_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function serializeValue_(v) {
  if (v instanceof Date) return dateToText_(v);
  return v;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}