// 업무판 db의 옛 번호(AS-yymmdd-NN, 줄 순서 번호)를 내용 기준 새 번호로 옮긴다. 같은 고객이 두 번 저장돼 있으면 하나로 합친다.
// 사용: node tools/dbfix.js <db 목록 JSON(문서 배열: {id,version,data:{json,by,at}})> <나올 폴더>
//  → <폴더>/set/<새id>.json (쓸 문서), <폴더>/ops.json (batch writes), <폴더>/cases/<id>.json (합친 뒤 전체: sync.js 입력)
const fs = require('fs'), path = require('path');
const { keyOf, stableId } = require('./ids');
const [listFile, out] = process.argv.slice(2);
const docs = JSON.parse(fs.readFileSync(listFile, 'utf8'));
for (const d of ['set', 'cases']) fs.mkdirSync(path.join(out, d), { recursive: true });
const OLD = /^AS-\d{6}-\d{2}$/, groups = {}, keep = [];
for (const d of docs) {
  let c; try { c = JSON.parse(d.data.json); } catch (e) { continue; }
  if (!OLD.test(d.id)) { keep.push({ d, c }); continue; }
  const k = keyOf(c.recv, c.name, c.product); (groups[k] = groups[k] || []).push({ d, c });
}
const ops = [], report = [], used = {};
const human = h => h && !['시트', '자동', '택배 연동', '카페24', '시스템'].includes(h.who);
for (const [k, g] of Object.entries(groups)) {
  g.sort((a, b) => String(b.d.data.at).localeCompare(String(a.d.data.at)));
  const win = g[0], c = win.c, id = stableId(c.recv, c.name, c.product, used);
  if (g.length > 1) {
    const seen = new Set(c.hist.map(h => h.t + '|' + h.x));
    for (const o of g.slice(1)) for (const h of o.c.hist) if (human(h) && !/^(보류로 옮김|종결)$/.test(h.x) && !seen.has(h.t + '|' + h.x)) { c.hist.push(h); seen.add(h.t + '|' + h.x); }
    c.hist.sort((a, b) => String(a.t).localeCompare(String(b.t)));
    report.push({ merged: g.map(x => x.d.id), into: id, stage: c.stage });
  }
  c.id = id; delete c._undo;
  const doc = { json: JSON.stringify(c), by: win.d.data.by, at: win.d.data.at };
  fs.writeFileSync(path.join(out, 'set', id + '.json'), JSON.stringify(doc));
  fs.writeFileSync(path.join(out, 'cases', id + '.json'), JSON.stringify(doc));
  ops.push({ op: 'set', collection: 'cases', doc_id: id, file_path: path.join(out, 'set', id + '.json') });
  for (const x of g) ops.push({ op: 'delete', collection: 'cases', doc_id: x.d.id, if_version: x.d.version });
}
for (const { d } of keep) fs.writeFileSync(path.join(out, 'cases', d.id + '.json'), JSON.stringify(d.data));
fs.writeFileSync(path.join(out, 'ops.json'), JSON.stringify(ops));
console.log(JSON.stringify({ old: Object.values(groups).reduce((n, g) => n + g.length, 0), newDocs: Object.keys(groups).length, kept: keep.length, ops: ops.length, merged: report }, null, 1));
