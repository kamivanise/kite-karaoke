/**
 * カラオケ利用ログの「管理画面」。受け取り係とは別のプロジェクトにする。
 * script.google.com で新しいプロジェクトを作って貼り、
 * ウェブアプリとして「実行ユーザー：自分」「アクセス：自分のみ」で公開する。
 * → 公開 URL は、あなたの Google アカウントでログインしているときだけ開ける。
 * URL の末尾に ?days=7 / ?days=30 / ?days=90 / ?days=0（全期間）を付けると期間を変えられる。
 */
const SHEET_ID = '1Jq3boKjYm0pzK9tzxSRCb0NPNiTNahLi7TLwpS7DO0k'; // スプレッドシート「カラオケ利用ログ」
const SHEET_NAME = 'log';
const TZ = 'Asia/Tokyo';
const DAY = 86400000;

function doGet(e) {
  const days = (e && e.parameter && /^\d{1,4}$/.test(e.parameter.days || '')) ? +e.parameter.days : 30;
  return HtmlService.createHtmlOutput(render_(load_(), days))
    .setTitle('カラオケ利用状況')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 列: 0受信日時 1端末ID 2種類 3再生秒数
function load_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const v = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues() : [];
  return v.filter(r => r[0] instanceof Date && r[1]);
}

const ymd_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
// その日を含む週の月曜（日本時間）
function monday_(day) {
  const d = new Date(day + 'T00:00:00Z'), w = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - w * DAY).toISOString().slice(0, 10);
}

function render_(all, days) {
  // 端末ごとに「初めて来た日」を全期間から求める（新規の判定用）
  const first = {};
  all.forEach(r => { const day = ymd_(r[0]); if (!first[r[1]] || day < first[r[1]]) first[r[1]] = day; });

  const since = days > 0 ? ymd_(new Date(Date.now() - (days - 1) * DAY)) : '0000';
  const rows = all.filter(r => ymd_(r[0]) >= since);

  const devDays = {};               // 端末 → 使った日の集合
  const byDay = {}, byWeek = {};    // 日・週 → {端末, 開いた回数, 秒}
  let sec = 0, opens = 0;
  const bucket = (m, k) => m[k] = m[k] || { dev: new Set(), opens: 0, sec: 0 };
  rows.forEach(r => {
    const dev = r[1], day = ymd_(r[0]), s = r[2] === 'play' ? (+r[3] || 0) : 0;
    (devDays[dev] = devDays[dev] || new Set()).add(day);
    [bucket(byDay, day), bucket(byWeek, monday_(day))].forEach(b => {
      b.dev.add(dev); b.sec += s; if (r[2] === 'open') b.opens++;
    });
    sec += s; if (r[2] === 'open') opens++;
  });

  const devs = Object.keys(devDays), nDev = devs.length;
  const nDays = Object.keys(byDay).length;
  // 全期間のときは、最初の記録の日から今日までの日数で割る
  const firstDay = Object.keys(byDay).sort()[0];
  const span = days > 0 ? days : (firstDay ? Math.round((new Date(ymd_(new Date()) + 'T00:00:00Z') - new Date(firstDay + 'T00:00:00Z')) / DAY) + 1 : 1);
  const avgDau = nDays ? devs.reduce((a, d) => a + devDays[d].size, 0) / span : 0;
  const avgUseDays = nDev ? devs.reduce((a, d) => a + devDays[d].size, 0) / nDev : 0;

  // 頻度の分布：期間中に何日使ったか
  const bins = [[1, 1, '1日だけ'], [2, 3, '2〜3日'], [4, 7, '4〜7日'], [8, 14, '8〜14日'], [15, 1e9, '15日以上']];
  const binCount = bins.map(([lo, hi]) => devs.filter(d => devDays[d].size >= lo && devDays[d].size <= hi).length);
  const maxBin = Math.max(1, ...binCount);
  const binRows = bins.map((b, i) => `<tr><td>${b[2]}</td>${barCell_(binCount[i], maxBin, binCount[i] + '台')}` +
    `<td class="n">${nDev ? Math.round(binCount[i] / nDev * 100) : 0}%</td></tr>`).join('');

  const weekKeys = Object.keys(byWeek).sort().reverse().slice(0, 16);
  const maxW = Math.max(1, ...weekKeys.map(k => byWeek[k].dev.size));
  const weekRows = weekKeys.map(k => {
    const w = byWeek[k], fresh = [...w.dev].filter(d => monday_(first[d]) === k).length;
    return `<tr><td>${k.slice(5).replace('-', '/')}〜</td>${barCell_(w.dev.size, maxW, w.dev.size + '台')}` +
      `<td class="n">${fresh}</td><td class="n">${w.opens}</td><td class="n">${min_(w.sec)}</td></tr>`;
  }).join('');

  const dayKeys = Object.keys(byDay).sort().reverse().slice(0, 60);
  const maxD = Math.max(1, ...dayKeys.map(k => byDay[k].dev.size));
  const dayRows = dayKeys.map(k => {
    const d = byDay[k], fresh = [...d.dev].filter(x => first[x] === k).length;
    return `<tr><td>${k.slice(5).replace('-', '/')}</td>${barCell_(d.dev.size, maxD, d.dev.size + '台')}` +
      `<td class="n">${fresh}</td><td class="n">${d.opens}</td><td class="n">${min_(d.sec)}</td></tr>`;
  }).join('');

  const tabs = [[7, '7日'], [30, '30日'], [90, '90日'], [0, '全期間']].map(([v, l]) =>
    `<a href="?days=${v}"${v === days ? ' aria-current="page"' : ''} target="_top">${l}</a>`).join('');
  const empty = n => `<tr><td colspan="${n}">まだ記録がありません</td></tr>`;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
:root{--bg:#f3f6fa;--fg:#17202c;--muted:#5d6b7c;--line:#d6dee8;--surface:#fff;--bar:#bcd2f5}
@media (prefers-color-scheme:dark){:root{--bg:#0f141b;--fg:#e8eef5;--muted:#95a3b5;--line:#2b3644;--surface:#18202b;--bar:#2a4675}}
body{margin:0;padding:20px 16px 40px;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,"Hiragino Sans","Yu Gothic",sans-serif}
.w{max-width:760px;margin:0 auto}h1{font-size:1.3rem;margin:0 0 12px}h2{font-size:1rem;margin:28px 0 8px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.tabs a{padding:4px 12px;border:1px solid var(--line);border-radius:999px;color:var(--fg);text-decoration:none;background:var(--surface)}
.tabs a[aria-current]{background:var(--fg);color:var(--bg);font-weight:700}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.kpi div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.kpi b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:.8rem}
.tw{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{font-size:.75rem;color:var(--muted);font-weight:400}td.n,th.n{text-align:right}
td.bar{position:relative;min-width:110px}td.bar i{position:absolute;left:0;top:4px;bottom:4px;background:var(--bar);border-radius:3px}td.bar span{position:relative}
.note{color:var(--muted);font-size:.8rem;margin-top:24px}
</style></head><body><div class="w">
<h1>カラオケ利用状況</h1><nav class="tabs">${tabs}</nav>
<div class="kpi">
<div><b>${nDev}</b><span>使った端末</span></div>
<div><b>${avgDau.toFixed(1)}</b><span>1日あたりの端末（平均）</span></div>
<div><b>${avgUseDays.toFixed(1)}日</b><span>1台あたりの利用日数</span></div>
<div><b>${min_(sec)}</b><span>合計練習時間</span></div></div>
<h2>利用頻度（期間中に何日使ったか）</h2>
<div class="tw"><table><thead><tr><th>利用日数</th><th class="n">端末</th><th class="n">割合</th></tr></thead>
<tbody>${nDev ? binRows : empty(3)}</tbody></table></div>
<h2>週別（新しい順）</h2>
<div class="tw"><table><thead><tr><th>週</th><th class="n">端末</th><th class="n">うち初めて</th><th class="n">開いた回数</th><th class="n">練習時間</th></tr></thead>
<tbody>${weekRows || empty(5)}</tbody></table></div>
<h2>日別（新しい順・最大60日）</h2>
<div class="tw"><table><thead><tr><th>日付</th><th class="n">端末</th><th class="n">うち初めて</th><th class="n">開いた回数</th><th class="n">練習時間</th></tr></thead>
<tbody>${dayRows || empty(5)}</tbody></table></div>
<p class="note">端末＝ブラウザごとの番号の数で、人数そのものではありません。同じ人がスマホとPCで使えば2、履歴を消したりプライベートモードで開いたりしても別の端末として数えます。
練習時間はお手本・マイクで実際に再生した時間（カウントの4拍を除く）。日付・週は日本時間、週は月曜始まり。</p>
</div></body></html>`;
}

function barCell_(v, max, label) {
  return `<td class="n bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i><span>${label}</span></td>`;
}

function min_(s) {
  const m = s / 60;
  return m >= 60 ? (m / 60).toFixed(1) + '時間' : (m < 10 ? m.toFixed(1) : Math.round(m)) + '分';
}
