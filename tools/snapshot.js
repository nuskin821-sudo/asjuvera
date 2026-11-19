// AS 시트에서 읽어 온 값(JSON 파일)으로 보기용 업무판을 만든다. 시트는 읽기만 한다.
// 사용: node tools/snapshot.js <보드.html> <나올 파일.html> <기준시각 'YYYY-MM-DD HH:MM'> <탭이름=값파일.json[:시작행]> ...
// 값파일은 {values:[[...]]} 모양. 고객 이름은 가운데를 가리고, 연락처·주소는 싣지 않는다.
const fs = require('fs'), path = require('path');
const [board, out, at, ...tabArgs] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const stub = { SpreadsheetApp: {}, Session: {}, LockService: {}, HtmlService: {}, Utilities: { formatDate: () => at } };
const G = new Function(...Object.keys(stub), src + ';return {toCase_,date_,I,CUTOFF,DONE_TAB,NCOL};')(...Object.values(stub));
const mask = n => { n = String(n || '').trim().split(/\s+/)[0]; return n.length <= 1 ? n : n.length === 2 ? n[0] + '○' : n[0] + '○'.repeat(n.length - 2) + n[n.length - 1]; };
const clean = (s, n) => String(s || '').replace(/\d[\d\- ]{6,}\d/g, '***').replace(/\s+/g, ' ').trim().slice(0, n);
const cases = [], ids = {}, stats = {};
for (const a of tabArgs) {
  const [tab, rest] = a.split('='); const [file] = rest.split(':');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).values || [];
  const done = tab === G.DONE_TAB;
  let list = rows.filter(v => v && v.length && v[0] !== '접수일자');
  if (done) list = list.slice(-150);
  let n = 0;
  for (const r of list) {
    const v = []; for (let i = 0; i < G.NCOL; i++) v.push(r[i] == null ? '' : String(r[i]));
    if (!v[G.I.name] && !v[G.I.product]) continue;
    const d = G.date_(v[G.I.date]) || G.date_(v[G.I.applied]);
    if (!d || d < G.CUTOFF) continue;
    const pre = 'AS-' + d.slice(2).replace(/-/g, '') + '-'; let k = 1; while (ids[pre + ('0' + k).slice(-2)]) k++;
    v[21] = pre + ('0' + k).slice(-2); ids[v[21]] = 1; v[22] = '';
    const c = G.toCase_(tab, v).c; if (done) c.stage = 'done';
    c.name = mask(c.name); c.phone = ''; c.addr = ''; c.symptom = clean(c.symptom, 60); c.sheetMemo = clean(c.sheetMemo, 60); c.sheetProg = clean(c.sheetProg, 60);
    if (c.sheetNote) c.sheetNote = '시트 진행사항 확인: ' + c.sheetProg;
    if (c.alert) c.alert.x = '시트 진행사항: ' + c.sheetProg;
    c.inspect = clean(c.inspect, 30); c.outTrack = '';
    c.hist = [{ t: c.recv, who: '시트', x: '[' + tab + '] 탭' + (c.sheetProg ? ' · 진행사항: ' + c.sheetProg : '') + (c.sheetMemo ? ' · 비고: ' + c.sheetMemo : '') }];
    cases.push(c); n++;
  }
  stats[tab] = n;
}
const html = fs.readFileSync(board, 'utf8');
const mark = '<script>\n/* 실제 운영';
if (!html.includes(mark)) throw new Error('보드 파일에서 넣을 자리를 찾지 못했습니다');
const inj = '<script>window.AS_SNAPSHOT=' + JSON.stringify({ at, cases }).replace(/</g, '\\u003c') + ';</script>\n';
fs.writeFileSync(out, html.replace(mark, inj + mark));
const by = {}; cases.forEach(c => by[c.stage] = (by[c.stage] || 0) + 1);
console.log(JSON.stringify({ at, total: cases.length, tabs: stats, stages: by }));
