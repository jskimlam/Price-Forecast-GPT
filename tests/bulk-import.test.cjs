const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync('apps_script/admin.html','utf8');
const ctx=vm.createContext({console,sessionStorage:{getItem:()=>''},window:{addEventListener(){}},document:{getElementById:()=>({})},setTimeout,clearTimeout});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
const parse=text=>JSON.parse(JSON.stringify(ctx.parseBulkTable(text)));
test('TSV retains blanks, reordered codes, commas, decimals, multiple dates',()=>{
 const rows=parse('\tPHASM05\tNMCL001\tPAAAD00\n\tMT\tBBL\tMT\nAssessDate\tc\tc\tc\n2025-01-02\t1,234.567\t　\t810&#x20;\n2025-01-01\t0\t-12.5\t');
 assert.deepEqual(rows,[{date:'2025-01-01',values:{PHASM05:0,NMCL001:-12.5}},{date:'2025-01-02',values:{PHASM05:1234.567,PAAAD00:810}}]);
});
test('Markdown metadata and separators',()=>assert.deepEqual(parse('| | PAAAD00 | NMCL001 |\n| --- | --- | --- |\n| AssessDate | c | c |\n| 2025/1/2 | 12.345 | 　|'),[{date:'2025-01-02',values:{PAAAD00:12.345}}]));
test('reject malformed dates, duplicate dates/codes, missing columns and invalid prices',()=>{
 for(const text of ['\tPAAAD00\n2025-02-30\t1','\tPAAAD00\n2025-01-01\t1\n2025-01-01\t2','\tPAAAD00\tPAAAD00\n2025-01-01\t1\t2','\tPAAAD00\tNMCL001\n2025-01-01\t1','\tPAAAD00\n2025-01-01\t12abc','\tPAAAD00\n#######\t1']) assert.throws(()=>parse(text));
});
const server=vm.createContext({console,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastColumn:()=>3,getRange:()=>({getDisplayValues:()=>[['','PAAAD00','NMCL001']]})})})}});
vm.runInContext(fs.readFileSync('apps_script/Code.gs','utf8'),server);
vm.runInContext(`assertSession_=()=>{}; normalizeDateText_=x=>x; dateToText_=x=>typeof x==='string'?x:x.toISOString().slice(0,10); parseDate_=x=>new Date(x+'T00:00:00Z');`,server);
test('preview identifies existing/previous values and ignores unknown codes',()=>{
 server.exportPrices_=()=>({meta:{codes:['','PAAAD00','NMCL001'],labels:['','Naphtha','WTI']},rows:[{date:'2025-01-01',PAAAD00:10,NMCL001:20},{date:'2025-01-02',PAAAD00:11}]});
 const r=server.apiPreviewBulkPrices('t',[{date:'2025-01-02',values:{PAAAD00:11,NMCL001:21,ZZZZ000:5}}]);
 assert.equal(r.rows[0].cells[0].status,'same');assert.equal(r.rows[0].cells[1].status,'new');assert.equal(r.rows[0].cells[1].previous,20);assert.equal(r.ignored[0],'ZZZZ000');
});
test('bulk writes selected cells only; verifies before one forecast dispatch; detects conflict',()=>{
 let db={},writes=0,dispatches=0;
 server.getPriceSnapshot_=date=>({values:db[date]||{}});
 server.savePriceSnapshotUnlocked_=row=>{writes++;db[row.date]={...(db[row.date]||{}),...row.values};return {date:row.date,updatedCodes:Object.keys(row.values).length};};
 server.dispatchForecast_=()=>{dispatches++;return {ok:true};};
 const rows=[{date:'2025-01-02',values:{PAAAD00:12},expected:{PAAAD00:null}},{date:'2025-01-03',values:{NMCL001:22},expected:{NMCL001:null}}];
 assert.equal(server.apiSaveBulkPrices('t',rows).ok,true);assert.equal(writes,2);assert.equal(dispatches,1);assert.equal(db['2025-01-02'].NMCL001,undefined);
 assert.equal(server.apiSaveBulkPrices('t',rows).ok,false);assert.equal(writes,2);assert.equal(dispatches,1);
});
test('partial write failure never dispatches and returns completed dates',()=>{
 let writes=0,dispatches=0,db={};server.getPriceSnapshot_=date=>({values:db[date]||{}});
 server.savePriceSnapshotUnlocked_=r=>{if(++writes===2)throw new Error('storage failure');db[r.date]=r.values;return {date:r.date,updatedCodes:1};};server.dispatchForecast_=()=>{dispatches++;};
 const r=server.apiSaveBulkPrices('t',[{date:'2025-01-01',values:{PAAAD00:1},expected:{PAAAD00:null}},{date:'2025-01-02',values:{PAAAD00:2},expected:{PAAAD00:null}}]);
 assert.equal(r.ok,false);assert.equal(r.saved.length,1);assert.equal(dispatches,0);
});
