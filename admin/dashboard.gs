/**
 * カラオケ利用ログの「管理画面」。受け取り係とは別のプロジェクトにする。
 * script.google.com で新しいプロジェクトを作って貼り、
 * ウェブアプリとして「実行ユーザー：自分」「アクセス：自分のみ」で公開する。
 * → 公開 URL は、あなたの Google アカウントでログインしているときだけ開ける。
 * URL の末尾に ?days=7 / ?days=30 / ?days=90 / ?days=0（全期間）を付けると期間を変えられる。
 */
const SHEET_ID = 'ここにスプレッドシートのIDを貼る';
const SHEET_NAME = 'log';
const TZ = 'Asia/Tokyo';
const SONG_NAME = { kite: 'カイト', daichi: '大地讃頌' };
const PART_NAME = { S: 'ソプラノ', A: 'アルト', T: 'テノール', B: 'バス', M: '男声' };
const PART_ORDER = 'SATBM';

function doGet(e) {
  const days = (e && e.parameter && /^\d{1,4}$/.test(e.parameter.days || '')) ? +e.parameter.days : 30;
  const html = render_(load_(days), days);
  return HtmlService.createHtmlOutput(html)
    .setTitle('カラオケ利用状況')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 列: 0受信日時 1端末時刻 2端末ID 3種類 4曲 5パート 6再生方法 7判定 8開始小節 9終了小節 10秒数 11最後まで 12点数 13版
function load_(days) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const values = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues() : [];
  const since = days > 0 ? Date.now() - days * 86400000 : 0;
  return values.filter(r => r[0] instanceof Date && r[0].getTime() >= since);
}

function render_(rows, days) {
  const allDev = new Set(), playDev = new Set();
  let plays = 0, sec = 0;
  const cells = {};   // 曲|パート ごとの集計
  const byDay = {};   // 日付ごとの集計
  rows.forEach(r => {
    const dev = r[2], day = Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd');
    allDev.add(dev);
    const dd = byDay[day] = byDay[day] || { dev: new Set(), plays: 0, sec: 0 };
    dd.dev.add(dev);
    if (r[3] !== 'play') return;
    const s = +r[10] || 0;
    playDev.add(dev); plays++; sec += s; dd.plays++; dd.sec += s;
    const key = r[4] + '|' + r[5];
    const c = cells[key] = cells[key] || { song: r[4], part: r[5], dev: new Set(), mic: 0, guide: 0, sec: 0, fin: 0, scSum: 0, scN: 0 };
    c.dev.add(dev); c.sec += s;
    if (r[6] === 'mic') c.mic++; else c.guide++;
    if (r[11] === 1) c.fin++;
    if (r[6] === 'mic' && r[11] === 1 && r[12] !== '') { c.scSum += +r[12]; c.scN++; }
  });

  const list = Object.keys(cells).map(k => cells[k]).sort((a, b) =>
    a.song === b.song ? PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) : String(a.song).localeCompare(String(b.song)));
  const maxSec = Math.max(1, ...list.map(c => c.sec));
  const partRows = list.map(c => {
    const n = c.mic + c.guide;
    return `<tr><td>${esc_(SONG_NAME[c.song] || c.song)}</td><td>${esc_(PART_NAME[c.part] || c.part || '—')}</td>` +
      `<td class="n"><b>${c.dev.size}</b></td><td class="n">${n}<small>（歌${c.mic}・聴${c.guide}）</small></td>` +
      `<td class="n bar"><i style="width:${(c.sec / maxSec * 100).toFixed(1)}%"></i><span>${min_(c.sec)}</span></td>` +
      `<td class="n">${min_(c.sec / c.dev.size)}</td><td class="n">${Math.round(c.fin / n * 100)}%</td>` +
      `<td class="n">${c.scN ? Math.round(c.scSum / c.scN) : '—'}</td></tr>`;
  }).join('');

  const dayKeys = Object.keys(byDay).sort().reverse().slice(0, 60);
  const maxDayDev = Math.max(1, ...dayKeys.map(k => byDay[k].dev.size));
  const dayRows = dayKeys.map(k => {
    const d = byDay[k];
    return `<tr><td>${k.slice(5).replace('-', '/')}</td>` +
      `<td class="n bar"><i style="width:${(d.dev.size / maxDayDev * 100).toFixed(1)}%"></i><span>${d.dev.size}</span></td>` +
      `<td class="n">${d.plays}</td><td class="n">${min_(d.sec)}</td></tr>`;
  }).join('');

  const tabs = [[7, '7日'], [30, '30日'], [90, '90日'], [0, '全期間']].map(([v, l]) =>
    `<a href="?days=${v}"${v === days ? ' aria-current="page"' : ''} target="_top">${l}</a>`).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
:root{--bg:#f3f6fa;--fg:#17202c;--muted:#5d6b7c;--line:#d6dee8;--surface:#fff;--bar:#bcd2f5}
@media (prefers-color-scheme:dark){:root{--bg:#0f141b;--fg:#e8eef5;--muted:#95a3b5;--line:#2b3644;--surface:#18202b;--bar:#2a4675}}
body{margin:0;padding:20px 16px 40px;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,"Hiragino Sans","Yu Gothic",sans-serif}
.w{max-width:860px;margin:0 auto}h1{font-size:1.3rem;margin:0 0 12px}h2{font-size:1rem;margin:28px 0 8px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.tabs a{padding:4px 12px;border:1px solid var(--line);border-radius:999px;color:var(--fg);text-decoration:none;background:var(--surface)}
.tabs a[aria-current]{background:var(--fg);color:var(--bg);font-weight:700}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.kpi b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:.8rem}
.tw{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{font-size:.75rem;color:var(--muted);font-weight:400}td.n,th.n{text-align:right}small{color:var(--muted)}
td.bar{position:relative;min-width:90px}td.bar i{position:absolute;left:0;top:4px;bottom:4px;background:var(--bar);border-radius:3px}td.bar span{position:relative}
.note{color:var(--muted);font-size:.8rem;margin-top:24px}
</style></head><body><div class="w">
<h1>カラオケ利用状況</h1><nav class="tabs">${tabs}</nav>
<div class="kpi">
<div><b>${allDev.size}</b><span>開いた端末</span></div>
<div><b>${playDev.size}</b><span>再生した端末</span></div>
<div><b>${plays}</b><span>再生回数</span></div>
<div><b>${min_(sec)}</b><span>合計再生時間</span></div></div>
<h2>曲・パート別</h2>
<div class="tw"><table><thead><tr><th>曲</th><th>パート</th><th class="n">端末数</th><th class="n">再生回数</th><th class="n">合計時間</th><th class="n">1端末あたり</th><th class="n">最後まで</th><th class="n">平均点</th></tr></thead>
<tbody>${partRows || '<tr><td colspan="8">まだ記録がありません</td></tr>'}</tbody></table></div>
<h2>日別（新しい順）</h2>
<div class="tw"><table><thead><tr><th>日付</th><th class="n">端末数</th><th class="n">再生回数</th><th class="n">再生時間</th></tr></thead>
<tbody>${dayRows || '<tr><td colspan="4">まだ記録がありません</td></tr>'}</tbody></table></div>
<p class="note">端末数＝ブラウザごとの番号の数で、人数ではありません。同じ人がスマホとPCで使えば2、ブラウザの履歴を消したりプライベートモードで開いたりしても別の端末として数えます。
「歌」はマイクで歌う、「聴」はお手本だけ聴く。時間はカウントの4拍を除いた実際の再生時間。平均点はマイクで最後まで歌った回だけの平均。</p>
</div></body></html>`;
}

function min_(s) {
  const m = s / 60;
  return m >= 60 ? (m / 60).toFixed(1) + '時間' : (m < 10 ? m.toFixed(1) : Math.round(m)) + '分';
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
