// 시트 줄 → 접수번호 붙이기. snapshot.js(업무판 만들기)와 sync.js(시트 반영)가 똑같이 쓴다.
// 번호는 ① 시트 Q열 '접수번호'에 적혀 있으면 그것, ② 없으면 접수일·이름·제품으로 만든다.
// 같은 건이 여러 탭에 있으면(줄을 복사해 둔 경우) 진행이 더 나간 탭의 줄만 쓰고 나머지는 dupes로 알린다.
const fs = require('fs'), path = require('path');
const { keyOf, stableId, norm } = require('./ids');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const stub = { SpreadsheetApp: {}, Session: {}, LockService: {}, HtmlService: {}, Utilities: { formatDate: () => '' } };
const G = new Function(...Object.keys(stub), src + ';return {date_,CUTOFF};')(...Object.values(stub));
const Q = 16, IDRE = /^AS-\d{6}-[0-9A-Z]{4}[A-Z]?$/;
const RANK = { '보류': 0, 'as': 1, '수거완료': 2, '유상AS입금대기': 3, '출고예정': 4, '처리완료': 5 };
// tabs: [{name, start, rows}] → {recs:[{tab,row,r,recv,name,product,qid,id}], dupes:[{id,keep:{tab,row},drop:[{tab,row}]}]}
function scan(tabs) {
  const all = [];
  for (const t of tabs) t.rows.forEach((r, i) => {
    if (!r || !r.length || r[0] === '접수일자') return;
    const name = String(r[2] || '').trim(), product = String(r[5] || '');
    if (!name && !product) return;
    const recv = G.date_(String(r[1] || '')) || G.date_(String(r[0] || ''));
    const d = G.date_(String(r[0] || '')) || G.date_(String(r[1] || ''));
    if (!d || d < G.CUTOFF || !recv) return;
    const q = String(r[Q] || '').trim(), qid = IDRE.test(q) ? q : '';
    all.push({ tab: t.name, row: t.start + i, r, recv, name, product, qid, qraw: q, ident: qid || stableId(recv, name, product, null) });
  });
  // 복사된 줄: 직원이 줄을 복사해 새 고객으로 고쳐 쓰면 Q열 번호(와 P열 메모)가 딸려 온다.
  // 같은 번호가 여러 줄이고, 그 번호의 진짜 주인(내용으로 만든 번호가 Q와 같은 줄)이 있을 때, 주인과 접수일·이름·제품 중 둘 이상 다른 줄은 새 건으로 본다.
  const sg = x => [x.recv, norm(x.name), norm(x.product)], byQ = {};
  all.forEach(x => { if (x.qid) (byQ[x.qid] = byQ[x.qid] || []).push(x); });
  for (const [qid, g] of Object.entries(byQ)) {
    if (g.length < 2) continue;
    const owner = g.find(x => stableId(x.recv, x.name, x.product, null) === qid.slice(0, 14)); if (!owner) continue;
    const o = sg(owner), op = String(owner.r[Q - 1] || '').trim();
    for (const x of g) {
      if (x === owner) continue; const a = sg(x); if ((a[0] === o[0]) + (a[1] === o[1]) + (a[2] === o[2]) >= 2) continue;
      const p = String(x.r[Q - 1] || '').trim();
      x.copied = qid; x.clearP = !!p && op.startsWith(p); x.qid = ''; x.ident = stableId(x.recv, x.name, x.product, null); // 메모는 주인 줄에 똑같이 남아 있을 때만 비운다
    }
  }
  const groups = {}; all.forEach(x => (groups[x.ident] = groups[x.ident] || []).push(x));
  const recs = [], dupes = [];
  for (const [ident, g] of Object.entries(groups)) {
    const top = Math.max(...g.map(x => RANK[x.tab] ?? 0));
    const keep = g.filter(x => (RANK[x.tab] ?? 0) === top), drop = g.filter(x => (RANK[x.tab] ?? 0) !== top);
    keep.forEach((x, n) => { x.id = n ? ident + String.fromCharCode(65 + n) : ident; recs.push(x); }); // 같은 탭에 같은 건이 두 줄이면 둘째부터 B, C…
    if (drop.length) dupes.push({ id: ident, keep: { tab: keep[0].tab, row: keep[0].row }, drop: drop.map(x => ({ tab: x.tab, row: x.row })) });
  }
  return { recs, dupes };
}
module.exports = { scan, Q, IDRE, RANK, date_: G.date_, norm, keyOf };
