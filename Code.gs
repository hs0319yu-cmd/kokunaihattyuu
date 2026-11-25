/** 国内発注アプリ 共有データサーバー（Google Apps Script）
 * Webアプリは「次のユーザーとして実行：自分」「アクセスできるユーザー：全員」でデプロイ。
 * 注文・仕入先の更新はScriptLockで直列化し、同時更新による上書きを抑止します。
 */
const APP_TITLE = '国内発注アプリ共有データ';
const PROP_KEY = 'ORDER_APP_SPREADSHEET_ID';

function doGet(e) {
  // GitHub Pages からのAPI呼び出し（JSONP）。従来のGAS内表示も残す。
  if (e && e.parameter && e.parameter.api === '1') return handleApi_(e);
  setupDatabase_();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('国内発注アプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function handleApi_(e) {
  const callback = String(e.parameter.callback || '');
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput('/* invalid callback */').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  let result;
  try {
    const p = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
    let data;
    switch (String(e.parameter.action || '')) {
      case 'getData': data = getSharedData(); break;
      case 'saveOrder': data = saveSharedOrder(p.record); break;
      case 'setReceived': data = setSharedReceived(p.orderId, p.itemId, p.received); break;
      case 'deleteOrder': data = deleteSharedOrder(p.orderId); break;
      case 'upsertSupplier': data = upsertSharedSupplier(p.supplier, p.oldName); break;
      case 'deleteSupplier': data = deleteSharedSupplier(p.name); break;
      default: throw new Error('不明なAPI操作です');
    }
    result = {ok:true, data:data};
  } catch (err) {
    result = {ok:false, error:String(err && err.message || err)};
  }
  const body = callback + '(' + JSON.stringify(result).replace(/</g, '\\u003c') + ');';
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function setupDatabase_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_KEY);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(APP_TITLE);
    props.setProperty(PROP_KEY, ss.getId());
  }
  ensureSheet_(ss, '注文履歴', ['注文番号','注文日','作成日時','注文者','仕入先','FAX','商品明細JSON','備考']);
  ensureSheet_(ss, '仕入先', ['仕入先名','FAX','住所']);
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  return sh;
}

function getSharedData() {
  const ss = setupDatabase_();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const orderSh = ss.getSheetByName('注文履歴');
    const rows = orderSh.getLastRow() > 1 ? orderSh.getRange(2,1,orderSh.getLastRow()-1,8).getValues() : [];
    const orders = rows.map(r => ({id:String(r[0]),date:String(r[1]),createdAt:String(r[2]),operator:String(r[3]),supplier:String(r[4]),fax:String(r[5]),items:parseJson_(r[6],[]),notes:String(r[7])})).reverse();
    const supplierSh = ss.getSheetByName('仕入先');
    const sr = supplierSh.getLastRow() > 1 ? supplierSh.getRange(2,1,supplierSh.getLastRow()-1,3).getValues() : [];
    const suppliers = sr.map(r=>({name:String(r[0]),fax:String(r[1]),address:String(r[2]||'')}));
    return {orders:orders,suppliers:suppliers};
  } finally { lock.releaseLock(); }
}

function saveSharedOrder(record) {
  if (!record || !record.id) throw new Error('注文データが不正です');
  const ss=setupDatabase_(), sh=ss.getSheetByName('注文履歴');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last=sh.getLastRow();
    const rows=last>1?sh.getRange(2,1,last-1,8).getValues():[];
    const idx=rows.findIndex(r=>String(r[0])===String(record.id));
    if(idx>=0){
      const oldItems=parseJson_(rows[idx][6],[]);
      record.items=(record.items||[]).map((it,i)=>{const old=oldItems.find(x=>x.id===it.id)||oldItems[i];return old&&old.name===it.name?Object.assign({},it,{received:!!old.received}):it;});
      sh.getRange(idx+2,1,1,8).setValues([orderRow_(record)]);
    } else {
      sh.appendRow(orderRow_(record));
    }
    SpreadsheetApp.flush();
    return record;
  } finally { lock.releaseLock(); }
}

function orderRow_(o) { return [String(o.id),String(o.date||''),String(o.createdAt||new Date().toISOString()),String(o.operator||''),String(o.supplier||''),String(o.fax||''),JSON.stringify(o.items||[]),String(o.notes||'')]; }
function parseJson_(v, fallback) { try { return JSON.parse(String(v||'')); } catch(e) { return fallback; } }

function setSharedReceived(orderId,itemId,received) {
  const ss=setupDatabase_(), sh=ss.getSheetByName('注文履歴');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last=sh.getLastRow();
    if(last>1){
      const rows=sh.getRange(2,1,last-1,8).getValues();
      const i=rows.findIndex(r=>String(r[0])===String(orderId));
      if(i>=0){const items=parseJson_(rows[i][6],[]);const it=items.find(x=>String(x.id)===String(itemId));if(it){it.received=!!received;sh.getRange(i+2,7).setValue(JSON.stringify(items));}}
    }
    SpreadsheetApp.flush();
    return getSharedDataUnlocked_(ss);
  } finally { lock.releaseLock(); }
}

function deleteSharedOrder(orderId) {
  const ss=setupDatabase_(), sh=ss.getSheetByName('注文履歴');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last=sh.getLastRow();
    if(last>1){const rows=sh.getRange(2,1,last-1,1).getValues();for(let i=rows.length-1;i>=0;i--){if(String(rows[i][0])===String(orderId))sh.deleteRow(i+2);}}
    SpreadsheetApp.flush(); return getSharedDataUnlocked_(ss);
  } finally { lock.releaseLock(); }
}

function getSharedDataUnlocked_(ss) {
  const sh=ss.getSheetByName('注文履歴'), last=sh.getLastRow();
  const rows=last>1?sh.getRange(2,1,last-1,8).getValues():[];
  const orders=rows.map(r=>({id:String(r[0]),date:String(r[1]),createdAt:String(r[2]),operator:String(r[3]),supplier:String(r[4]),fax:String(r[5]),items:parseJson_(r[6],[]),notes:String(r[7])})).reverse();
  return {orders:orders};
}

function saveSharedSuppliers(suppliers) {
  const ss=setupDatabase_(), sh=ss.getSheetByName('仕入先');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last=sh.getLastRow(); if(last>1)sh.getRange(2,1,last-1,3).clearContent();
    const rows=(suppliers||[]).map(s=>[String(s.name||''),String(s.fax||''),String(s.address||'')]);
    if(rows.length)sh.getRange(2,1,rows.length,3).setValues(rows);
    SpreadsheetApp.flush(); return {ok:true};
  } finally { lock.releaseLock(); }
}


function upsertSharedSupplier(supplier, oldName) {
  if (!supplier || !supplier.name || !supplier.fax) throw new Error('仕入先名とFAX番号が必要です');
  const ss=setupDatabase_(), sh=ss.getSheetByName('仕入先');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last=sh.getLastRow();
    const rows=last>1?sh.getRange(2,1,last-1,3).getValues():[];
    let idx=-1;
    if(oldName) idx=rows.findIndex(r=>String(r[0])===String(oldName));
    if(idx<0) idx=rows.findIndex(r=>String(r[0])===String(supplier.name));
    const row=[String(supplier.name),String(supplier.fax),String(supplier.address||'')];
    if(idx>=0) sh.getRange(idx+2,1,1,3).setValues([row]); else sh.appendRow(row);
    SpreadsheetApp.flush();
    const all=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues():[];
    return {suppliers:all.map(r=>({name:String(r[0]),fax:String(r[1]),address:String(r[2]||'')}))};
  } finally { lock.releaseLock(); }
}

function deleteSharedSupplier(name) {
  const ss=setupDatabase_(), sh=ss.getSheetByName('仕入先');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last=sh.getLastRow();
    if(last>1){const rows=sh.getRange(2,1,last-1,1).getValues();for(let i=rows.length-1;i>=0;i--){if(String(rows[i][0])===String(name))sh.deleteRow(i+2);}}
    SpreadsheetApp.flush();
    const all=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,3).getValues():[];
    return {suppliers:all.map(r=>({name:String(r[0]),fax:String(r[1]),address:String(r[2]||'')}))};
  } finally { lock.releaseLock(); }
}
