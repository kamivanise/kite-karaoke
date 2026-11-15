// 利用ログの送信（一方通行。誰かは記録しない。端末ごとのランダムな番号・開いた/再生した・再生秒数だけ）
// 送り先は Google Apps Script（admin/collector.gs）。手順は admin/README.md
(()=>{
// ↓ Apps Script を「ウェブアプリ」として公開したときの URL（…/exec）を貼る。空なら何も送らない
const LOG_URL="";

const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}};
// ?nolog を付けて一度開いた端末は、以後ログを送らない（管理者の試し弾き用）。?log で元に戻す
try{const q=new URLSearchParams(location.search);if(q.has("nolog"))ls.set("kara-nolog","1");if(q.has("log"))ls.set("kara-nolog","0")}catch(e){}
const off=!LOG_URL||ls.get("kara-nolog")==="1"||location.protocol==="file:"||/^(localhost|127\.0\.0\.1)$/.test(location.hostname);

function uuid(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let dev=ls.get("kara-device");
if(!UUID_RE.test(dev||"")){dev=uuid();ls.set("kara-device",dev)}

function send(ev){
  if(off)return;
  ev.d=dev;
  const body=JSON.stringify(ev);
  // text/plain で送ると、ブラウザの事前確認（CORS preflight）なしで Apps Script に届く
  try{if(navigator.sendBeacon&&navigator.sendBeacon(LOG_URL,new Blob([body],{type:"text/plain;charset=UTF-8"})))return}catch(e){}
  try{fetch(LOG_URL,{method:"POST",mode:"no-cors",keepalive:true,headers:{"Content-Type":"text/plain;charset=UTF-8"},body}).catch(()=>{})}catch(e){}
}

window.KaraLog={
  // アプリを開いた
  open(){send({e:"open"})},
  // 1回の再生が終わった・止めた・ページを閉じた。実際に流れた秒数だけ送る
  play(sec){send({e:"play",sec})}
};
})();
