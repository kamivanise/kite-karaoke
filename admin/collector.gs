/**
 * カラオケ利用ログの「受け取り係」。
 * スプレッドシートの［拡張機能］→［Apps Script］に貼り、
 * ウェブアプリとして「実行ユーザー：自分」「アクセス：全員」で公開する。
 * 受け取ったログをシート「log」に1行ずつ追記するだけで、読み出す機能は持たない。
 */
const SHEET_NAME = 'log';
const HEAD = ['受信日時', '端末時刻', '端末ID', '種類', '曲', 'パート', '再生方法', '判定',
  '開始小節', '終了小節', '秒数', '最後まで', '点数', '版'];

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 2000) return out_('too large');
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

// 決まった形の値だけを通す（文字列は英数字のみ＝シートの数式として解釈されない）
function clean_(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const d = String(ev.d || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d)) return null;
  const type = pick_(ev.e, ['open', 'play']);
  if (!type) return null;
  const song = /^[a-z0-9_-]{1,24}$/.test(String(ev.s || '')) ? String(ev.s) : '';
  const t = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(ev.t || '')) ? String(ev.t) : '';
  return [
    new Date(), t, d, type, song,
    pick_(ev.p, ['S', 'A', 'T', 'B', 'M']),
    type === 'play' ? pick_(ev.k, ['mic', 'guide']) : '',
    type === 'play' ? pick_(ev.m, ['easy', 'normal', 'hard']) : '',
    int_(ev.f, 1, 999), int_(ev.to, 1, 999), int_(ev.sec, 0, 3600),
    ev.fin === true ? 1 : ev.fin === false ? 0 : '',
    int_(ev.sc, 0, 100), int_(ev.v, 0, 999)
  ];
}

function pick_(v, list) {
  return list.indexOf(v) >= 0 ? v : '';
}

function int_(v, lo, hi) {
  if (typeof v !== 'number' || !isFinite(v)) return '';
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
