/**
 * カラオケ利用ログの「受け取り係」。
 * スプレッドシートの［拡張機能］→［Apps Script］に貼り、
 * ウェブアプリとして「実行ユーザー：自分」「アクセス：全員」で公開する。
 * 受け取ったログをシート「log」に1行ずつ追記するだけで、読み出す機能は持たない。
 */
const SHEET_NAME = 'log';
const HEAD = ['受信日時', '端末ID', '種類', '再生秒数'];

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 1000) return out_('too large');
    const row = clean_(JSON.parse(raw));
    if (!row) return out_('bad');
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet_().appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return out_('ok');
  } catch (err) {
    return out_('error');
  }
}

// ブラウザで URL を開いても中身は見えない
function doGet() {
  return out_('ok');
}

function out_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 決まった形の値だけを通す（端末IDは英数字とハイフンのみ＝シートの数式として解釈されない）
function clean_(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const d = String(ev.d || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d)) return null;
  if (ev.e === 'open') return [new Date(), d, 'open', ''];
  if (ev.e === 'play' && typeof ev.sec === 'number' && isFinite(ev.sec)) {
    return [new Date(), d, 'play', Math.max(0, Math.min(3600, Math.round(ev.sec)))];
  }
  return null;
}
