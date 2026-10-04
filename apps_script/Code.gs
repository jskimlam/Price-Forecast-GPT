const PRICE_SHEET = 'prices';
const REQUIRED_TABS = ['prices','variables','targets','forecast_history','actual_vs_forecast','model_score','settings'];

function initialize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Google Sheet에서 Extensions > Apps Script로 연 뒤 실행하세요.');
  const missing = REQUIRED_TABS.filter(n => !ss.getSheetByName(n));
  if (missing.length) throw new Error('필수 탭 누락: ' + missing.join(', '));
  const p = PropertiesService.getScriptProperties();
  p.setProperty('SPREADSHEET_ID', ss.getId());
  if (!p.getProperty('GITHUB_REPO')) p.setProperty('GITHUB_REPO', 'jskimlam/Price-Forecast-GPT');
  return {ok:true, spreadsheetId:ss.getId(), title:ss.getName()};
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health') return json_({ok:true, service:'Price-Forecast-GPT', ts:new Date().toISOString()});
    if (action === 'data') {
      requireReadToken_(e.parameter.token || '');
      return json_({ok:true, prices:readPriceMatrix_(), ts:new Date().toISOString()});
    }
    return json_({ok:false,error:'unknown action'});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    if (String(p.action || '') !== 'save') return json_({ok:false,error:'unknown action'});
    requireAdmin_(p.password || '');
    const date = String(p.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
    let values = {};
    try { values = JSON.parse(p.values || '{}'); } catch (_) { throw new Error('values JSON error'); }
    const updated = upsertPriceRow_(date, values);
    let dispatched = false, dispatchError = '';
    try { dispatched = dispatchBuild_(); } catch (err) { dispatchError = String(err && err.message || err); }
    return json_({ok:true,updated,dispatched,dispatchError});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function getBook_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('initialize()를 먼저 1회 실행하세요.');
  return SpreadsheetApp.openById(id);
}

function readPriceMatrix_() {
  const sh = getBook_().getSheetByName(PRICE_SHEET);
  if (!sh) throw new Error('prices sheet not found');
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 2) throw new Error('prices sheet is empty');
  const values = sh.getRange(1,1,lr,lc).getValues();
  values[0] = values[0].map(String);
  for (let r=1;r<values.length;r++) {
    if (values[r][0] instanceof Date) values[r][0] = Utilities.formatDate(values[r][0], 'Asia/Seoul', 'yyyy-MM-dd');
    for (let c=1;c<values[r].length;c++) if (values[r][c] === '') values[r][c] = null;
  }
  return values;
}

function upsertPriceRow_(dateText, patch) {
  const sh = getBook_().getSheetByName(PRICE_SHEET);
  const lc = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lc).getValues()[0].map(String);
  const allowed = new Set(headers.slice(1));
  const clean = {};
  Object.keys(patch || {}).forEach(k => {
    if (!allowed.has(k)) return;
    const n = Number(patch[k]);
    if (Number.isFinite(n)) clean[k] = n;
  });
  if (!Object.keys(clean).length) throw new Error('저장할 유효 가격이 없습니다.');

  const lr = sh.getLastRow();
  const dates = lr > 1 ? sh.getRange(2,1,lr-1,1).getDisplayValues().flat() : [];
  let row = dates.findIndex(v => v === dateText);
  if (row >= 0) row += 2;
  else {
    row = lr + 1;
    sh.getRange(row,1).setValue(new Date(dateText + 'T00:00:00+09:00')).setNumberFormat('yyyy-mm-dd');
  }
  let count = 0;
  headers.forEach((h,idx) => {
    if (idx === 0 || !(h in clean)) return;
    sh.getRange(row,idx+1).setValue(clean[h]);
    count++;
  });
  if (row === lr + 1 && sh.getLastRow() > 2) {
    sh.getRange(2,1,sh.getLastRow()-1,lc).sort({column:1,ascending:true});
  }
  SpreadsheetApp.flush();
  return count;
}

function dispatchBuild_() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('GITHUB_TOKEN') || '';
  const repo = p.getProperty('GITHUB_REPO') || 'jskimlam/Price-Forecast-GPT';
  if (!token) throw new Error('GITHUB_TOKEN Script Property가 없습니다.');
  const url = 'https://api.github.com/repos/' + repo + '/actions/workflows/build-site.yml/dispatches';
  const res = UrlFetchApp.fetch(url, {
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify({ref:'main'}),
    headers:{Authorization:'Bearer ' + token, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    muteHttpExceptions:true
  });
  const code = res.getResponseCode();
  if (code !== 204) throw new Error('GitHub dispatch failed ' + code + ': ' + res.getContentText().slice(0,300));
  return true;
}

function requireAdmin_(given) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '';
  if (!expected || given !== expected) throw new Error('admin password invalid');
}

function requireReadToken_(given) {
  const expected = PropertiesService.getScriptProperties().getProperty('READ_TOKEN') || '';
  if (!expected || given !== expected) throw new Error('read token invalid');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
