// 업무판(아티팩트 db) → AS 시트 쓰기 계획과 쓴 뒤 확인.
// 원칙: ① 줄은 시트 Q열 '접수번호'로 찾는다(직원이 이름·제품을 고쳐도, 줄을 다른 탭으로 옮겨도 따라간다). 번호가 아직 없으면 내용(접수일·이름·제품)이 딱 한 줄 맞을 때만.
//       ② 직원이 쓰는 칸(A~O)은 비어 있는 출고일자·송장번호만 채우고, 메모는 P열 '업무판 메모'에만 쓴다.
//       ③ 번호가 맞아도 접수일·이름·제품 셋 중 둘 이상이 다르면 쓰지 않는다(번호가 엉뚱한 줄에 붙은 경우를 막는다).
//       ④ 못 쓴 건·중복 줄은 status.json으로 남겨 업무판에 빨갛게 보이게 한다. ⑤ 쓴 뒤 다시 읽어 확인한다.
// 사용:
//   node tools/sync.js pending <db cases 폴더> <state.json> <since>
//   node tools/sync.js plan  <db cases 폴더> <state.json> <since 'YYYY-MM-DD HH:MM'> <탭=값파일[:시작행]> ...  > plan.json
//   node tools/sync.js check <plan.json> <탭=값파일[:시작행]> ...        (쓴 뒤 새로 읽은 값으로 확인. 문제 있으면 exit 2)
//   node tools/sync.js commit <plan.json> <state.json>
// 값파일은 {values:[[A..Q]]} 모양(시트 A:Q).
const fs = require('fs'), path = require('path');
const { scan, Q, RANK, date_, norm } = require('./rows');
const SYS = new Set(['시트', '자동', '택배 연동', '카페24', '시스템', '파트너시스템']);
const NOISE = /^(이전 단계로 되돌림|보류 해제$)/;
const P = 15, M = 12, N = 13;
const keyOf = (id, h) => id + '|' + h.t + '|' + h.who + '|' + h.x;
const sheetDate = t => { const [y, m, d] = t.slice(0, 10).split('-').map(Number); return `${y}. ${m}. ${d}`; };
const line = h => `${+h.t.slice(5, 7)}/${+h.t.slice(8, 10)} ${h.who}: ${h.x}`;
const loadTabs = args => args.map(t => { const [name, rest] = t.split('='); const [file, start] = rest.split(':'); return { name, start: +(start || 1), rows: JSON.parse(fs.readFileSync(file, 'utf8')).values || [] }; });
const readCases = dir => fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return typeof d.json === 'string' ? JSON.parse(d.json) : d.json; } catch (e) { return null; } }).filter(c => c && c.id);
const sig = x => ({ date: String(x.recv || '').slice(0, 10), name: norm(x.name), product: norm(x.product) });
const score = (a, b) => (a.date === b.date) + (a.name === b.name) + (a.product === b.product);

const [mode, ...a] = process.argv.slice(2);
if (mode === 'pending') {
  const [dbDir, stateFile, since] = a; const done = new Set(fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).keys : []); let n = 0; const ids = [], old = [];
  for (const c of readCases(dbDir)) {
    if (/^AS-\d{6}-\d{2}$/.test(c.id)) old.push(c.id);
    if (/^(HS|HSP|C24)-/.test(c.id)) continue;
    const k = (c.hist || []).filter(h => h && h.t && !SYS.has(h.who) && h.t >= since && !done.has(keyOf(c.id, h))).length; if (k) { n += k; ids.push(c.id); }
  }
  console.log(JSON.stringify({ pending: n, cases: ids, oldStyleIds: old }));
} else if (mode === 'plan') {
  const [dbDir, stateFile, since, ...tabArgs] = a;
  const done = new Set(fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).keys : []);
  const tabs = loadTabs(tabArgs), { recs, dupes } = scan(tabs), byId = {}; recs.forEach(x => byId[x.id] = x);
  const firstEmpty = name => { const t = tabs.find(x => x.name === name); let n = t.rows.length; while (n > 0 && !(t.rows[n - 1] || []).slice(0, 15).some(v => String(v || '').trim())) n--; return t.start + n; };
  const plan = [], skipped = [], touched = new Set(); let nextMove = firstEmpty('수거완료');
  for (const c of readCases(dbDir)) {
    if (/^(HS|HSP|C24)-/.test(c.id)) continue; // 현대홈쇼핑·카페24 건은 시트에 쓰지 않는다
    const ev = (c.hist || []).filter(h => h && h.t && !SYS.has(h.who) && h.t >= since && !done.has(keyOf(c.id, h)));
    if (!ev.length) continue;
    const cs = sig(c); let rec = byId[c.id], by = '번호';
    if (!rec) { const hits = recs.filter(x => score(sig(x), cs) === 3); if (hits.length === 1) { rec = hits[0]; by = '내용'; } else { skipped.push({ id: c.id, why: hits.length ? '시트에 같은 건이 ' + hits.length + '줄 있어 어느 줄인지 모름' : '시트에서 줄을 못 찾음 (줄이 지워졌거나, 번호가 붙기 전에 이름·제품을 고침)', events: ev.length }); continue; } }
    if (score(sig(rec), cs) < 2) { skipped.push({ id: c.id, why: '번호는 맞는데 접수일·이름·제품이 많이 달라 쓰지 않음 (' + rec.tab + ' ' + rec.row + '행 확인 필요)', events: ev.length }); continue; }
    const old = String(rec.r[P] || '');
    const notes = []; for (const x of ev) { if (NOISE.test(x.x)) continue; const l = line(x); if (!notes.includes(l) && !old.includes(l)) notes.push(l); }
    const e = { id: c.id, tab: rec.tab, row: rec.row, by, sig: sig(rec), add: notes, p: [old, ...notes].filter(Boolean).join('\n'), keys: ev.map(x => keyOf(c.id, x)) };
    const sh = ev.find(x => /^출고 완료/.test(x.x));
    if (sh && c.outTrack) { if (!String(rec.r[M] || '').trim()) e.setM = sheetDate(sh.t); if (!String(rec.r[N] || '').trim()) e.setN = String(c.outTrack); }
    if (rec.tab === 'as' && ev.some(x => /^(수거 완료 확인|창고 도착 확인)/.test(x.x))) { e.move = '수거완료'; e.moveTo = nextMove++; }
    if (rec.qid !== c.id && by === '번호') e.setQ = c.id;
    if (!e.add.length && !e.setM && !e.setN && !e.move) e.nothing = true;
    touched.add(rec.tab + '|' + rec.row); plan.push(e);
  }
  plan.sort((x, y) => x.tab.localeCompare(y.tab) || y.row - x.row); // 같은 탭은 아래 줄부터(줄을 지워도 위 번호가 안 밀리게)
  // 번호 붙이기: 진행 중 탭의 줄, 그리고 이번에 쓰는 줄. 처리완료의 옛 줄은 건드리지 않는다.
  const qfill = recs.filter(x => x.qid !== x.id && (!x.qraw || x.qid) && (x.tab !== '처리완료' || touched.has(x.tab + '|' + x.row)))  // Q칸에 직원이 다른 글을 적어 둔 줄은 건드리지 않는다
   .map(x => ({ tab: x.tab, row: x.row, id: x.id, sig: sig(x) })).sort((x, y) => x.tab.localeCompare(y.tab) || x.row - y.row);
  const status = { skipped: skipped.map(s => ({ id: s.id, why: s.why })), dupes: dupes.map(d => ({ id: d.id, keep: d.keep.tab + ' ' + d.keep.row + '행', drop: d.drop.map(x => x.tab + ' ' + x.row + '행').join(', ') })) };
  process.stdout.write(JSON.stringify({ since, plan, qfill, skipped, dupes, status }, null, 1));
} else if (mode === 'check') {
  const [planFile, ...tabArgs] = a; const { plan, qfill } = JSON.parse(fs.readFileSync(planFile, 'utf8')); const tabs = loadTabs(tabArgs), { recs } = scan(tabs); let bad = 0;
  const at = (tab, row) => { const t = tabs.find(x => x.name === tab); return t ? (t.rows[row - t.start] || []) : []; };
  for (const e of plan) {
    if (e.nothing) continue;
    const hits = recs.filter(x => x.id === e.id || score(sig(x), e.sig) === 3), want = e.move || e.tab, h = hits.find(x => x.id === e.id && x.tab === want) || hits.find(x => x.id === e.id) || hits.find(x => x.tab === want) || hits[0]; // 같은 내용의 줄이 둘이면 번호가 같은 줄을 본다
    const okRow = !!h && h.tab === want && score(sig(h), e.sig) >= 2;
    const okP = okRow && e.add.every(n => String(h.r[P] || '').includes(n));
    const okMN = okRow && (!e.setN || String(h.r[N] || '').replace(/\D/g, '') === String(e.setN).replace(/\D/g, ''));
    const stray = e.move ? recs.some(x => x.tab === e.tab && score(sig(x), e.sig) === 3) : false; // 옮긴 뒤 원래 탭에 남아 있으면 안 됨
    const ok = okRow && okP && okMN && !stray; if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'BAD  ') + e.id + ' → ' + (h ? h.tab + ' ' + h.row + '행' : '못 찾음') + (okRow && !okP ? ' · 메모 안 들어감' : '') + (okRow && !okMN ? ' · 송장번호 다름' : '') + (stray ? ' · 원래 탭에 줄이 남음' : ''));
  }
  let qok = 0; const qbad = [];
  for (const q of (qfill || [])) { // 번호가 '그 내용의 줄'에 붙었는지: 번호가 적힌 줄을 찾아 내용을 비교한다(줄 위치는 옮겨졌을 수 있음)
    const rows = []; for (const t of tabs) t.rows.forEach((r, i) => { if (String((r || [])[Q] || '').trim() === q.id) rows.push({ tab: t.name, row: t.start + i, r }); });
    const good = rows.length >= 1 && rows.every(x => score({ date: date_(String(x.r[1] || '')) || date_(String(x.r[0] || '')), name: norm(x.r[2]), product: norm(x.r[5]) }, q.sig) === 3);
    if (good) qok++; else qbad.push(q.id + (rows.length ? ' (' + rows.map(x => x.tab + ' ' + x.row + '행').join(', ') + ' 내용 다름)' : ' (번호가 안 적힘)'));
  }
  if (qfill && qfill.length) console.log('번호 붙이기: 확인 ' + qok + ' / ' + qfill.length + (qbad.length ? '  BAD: ' + qbad.join(' · ') : ''));
  process.exit(bad || qbad.length ? 2 : 0);
} else if (mode === 'commit') {
  const [planFile, stateFile] = a; const { plan } = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { keys: [] };
  const set = new Set(st.keys); plan.forEach(e => e.keys.forEach(k => set.add(k)));
  fs.writeFileSync(stateFile, JSON.stringify({ keys: [...set], at: new Date().toISOString() }));
  console.log('기록', set.size);
} else { console.error('mode: pending | plan | check | commit'); process.exit(1); }
