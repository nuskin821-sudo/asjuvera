// 업무판(아티팩트 db) → AS 시트 쓰기 계획과 쓴 뒤 확인.
// 원칙: ① 시트 줄은 위치가 아니라 내용(접수일·이름·제품)으로 찾는다. ② 딱 한 줄만 맞을 때만 쓴다(0줄·여러 줄이면 건너뛴다).
//       ③ 직원이 쓰는 칸(A~O)은 비어 있는 출고일자·송장번호만 채우고, 메모는 업무판 전용 P열('업무판 메모')에만 쓴다. ④ 쓴 뒤 다시 읽어 확인한다.
// 사용:
//   node tools/sync.js plan  <db cases 폴더> <state.json> <since 'YYYY-MM-DD HH:MM'> <탭=값파일[:시작행]> ...  > plan.json
//   node tools/sync.js check <plan.json> <탭=값파일[:시작행]> ...        (쓴 뒤 새로 읽은 값으로 확인. 문제 있으면 exit 2)
//   node tools/sync.js commit <plan.json> <state.json>                  (확인이 끝난 뒤 '반영함'으로 기록)
// 값파일은 {values:[[A..P]]} 모양(시트 A:P).
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const stub = { SpreadsheetApp: {}, Session: {}, LockService: {}, HtmlService: {}, Utilities: { formatDate: () => '' } };
const G = new Function(...Object.keys(stub), src + ';return {date_};')(...Object.values(stub));
const SYS = new Set(['시트', '자동', '택배 연동', '카페24', '시스템', '파트너시스템']);
const NOISE = /^(이전 단계로 되돌림|보류 해제$)/;
const P = 15, M = 12, N = 13; // 0부터: P열=업무판 메모, M=출고일자, N=송장번호
const norm = s => String(s || '').replace(/\s+/g, '').trim();
const keyOf = (id, h) => id + '|' + h.t + '|' + h.who + '|' + h.x;
const same = (r, m) => norm(r[2]) === norm(m.name) && norm(r[5]) === norm(m.product) && [G.date_(String(r[0] || '')), G.date_(String(r[1] || ''))].includes(m.date);
const sheetDate = t => { const [y, m, d] = t.slice(0, 10).split('-').map(Number); return `${y}. ${m}. ${d}`; };
const line = h => `${+h.t.slice(5, 7)}/${+h.t.slice(8, 10)} ${h.who}: ${h.x}`;
const loadTabs = args => args.map(t => { const [name, rest] = t.split('='); const [file, start] = rest.split(':'); return { name, start: +(start || 1), rows: JSON.parse(fs.readFileSync(file, 'utf8')).values || [] }; });
const find = (tabs, m) => { const hits = []; for (const t of tabs) t.rows.forEach((r, i) => { if (r && r.length && same(r, m)) hits.push({ tab: t.name, row: t.start + i, r }); }); return hits; };

const [mode, ...a] = process.argv.slice(2);
if (mode === 'plan') {
  const [dbDir, stateFile, since, ...tabArgs] = a;
  const done = new Set(fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).keys : []);
  const tabs = loadTabs(tabArgs), plan = [], skipped = [];
  const firstEmpty = name => { const t = tabs.find(x => x.name === name); if (!t) return null; let n = t.rows.length; while (n > 0 && !(t.rows[n - 1] || []).some(v => String(v || '').trim())) n--; return t.start + n; };
  for (const f of fs.readdirSync(dbDir).filter(f => f.endsWith('.json') && !f.startsWith('.'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dbDir, f), 'utf8'));
    const c = typeof d.json === 'string' ? JSON.parse(d.json) : d.json; if (!c || !c.id) continue;
    if (/^(HS|HSP|C24)-/.test(c.id)) continue; // 현대홈쇼핑·카페24 건은 시트에 쓰지 않는다
    const ev = (c.hist || []).filter(h => h && h.t && !SYS.has(h.who) && h.t >= since && !done.has(keyOf(c.id, h)));
    if (!ev.length) continue;
    const m = { date: String(c.recv || '').slice(0, 10), name: c.name, product: c.product };
    const hits = find(tabs, m);
    if (hits.length !== 1) { skipped.push({ id: c.id, why: hits.length ? '시트에 같은 건이 ' + hits.length + '줄' : '시트에서 줄을 못 찾음(이름·제품을 고쳤거나 줄이 지워짐)', events: ev.length }); continue; }
    const h = hits[0], old = String(h.r[P] || '');
    const notes = []; for (const x of ev) { if (NOISE.test(x.x)) continue; const l = line(x); if (!notes.includes(l) && !old.includes(l)) notes.push(l); }
    const e = { id: c.id, tab: h.tab, row: h.row, match: m, add: notes, p: [old, ...notes].filter(Boolean).join('\n'), keys: ev.map(x => keyOf(c.id, x)) };
    const sh = ev.find(x => /^출고 완료/.test(x.x));
    if (sh && c.outTrack) { if (!String(h.r[M] || '').trim()) e.setM = sheetDate(sh.t); if (!String(h.r[N] || '').trim()) e.setN = String(c.outTrack); }
    if (h.tab === 'as' && ev.some(x => /^(수거 완료 확인|창고 도착 확인)/.test(x.x))) { e.move = '수거완료'; e.moveTo = firstEmpty('수거완료'); }
    if (!e.add.length && !e.setM && !e.setN && !e.move) { e.nothing = true; }
    plan.push(e);
  }
  plan.sort((x, y) => (x.tab + x.row).localeCompare(y.tab + y.row));
  process.stdout.write(JSON.stringify({ since, plan, skipped }, null, 1));
} else if (mode === 'check') {
  const [planFile, ...tabArgs] = a; const { plan } = JSON.parse(fs.readFileSync(planFile, 'utf8')); const tabs = loadTabs(tabArgs); let bad = 0;
  for (const e of plan) {
    if (e.nothing) continue;
    const hits = find(tabs, e.match), want = e.move || e.tab, h = hits[0];
    const okRow = hits.length === 1 && h.tab === want;
    const okP = okRow && e.add.every(n => String(h.r[P] || '').includes(n));
    const okMN = okRow && (!e.setN || String(h.r[N] || '').replace(/\D/g, '') === String(e.setN).replace(/\D/g, ''));
    const ok = okRow && okP && okMN; if (!ok) bad++;
    console.log((ok ? 'OK   ' : 'BAD  ') + e.id + ' → ' + (h ? h.tab + ' ' + h.row + '행' : '못 찾음') + (hits.length > 1 ? ' (같은 건 ' + hits.length + '줄)' : '') + (okRow && !okP ? ' · 메모 안 들어감' : '') + (okRow && !okMN ? ' · 송장번호 다름' : ''));
  }
  process.exit(bad ? 2 : 0);
} else if (mode === 'commit') {
  const [planFile, stateFile] = a; const { plan } = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { keys: [] };
  const set = new Set(st.keys); plan.forEach(e => e.keys.forEach(k => set.add(k)));
  fs.writeFileSync(stateFile, JSON.stringify({ keys: [...set], at: new Date().toISOString() }));
  console.log('기록', set.size);
} else if (mode === 'pending') { // 시트를 읽기 전에: 아직 반영 안 한 직원 작업이 있는지만 센다 (state가 없으면 since 이후 전부)
  const [dbDir, stateFile, since] = a; const done = new Set(fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')).keys : []); let n = 0, ids = [], old = [];
  for (const f of fs.readdirSync(dbDir).filter(f => f.endsWith('.json') && !f.startsWith('.'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dbDir, f), 'utf8')); const c = typeof d.json === 'string' ? JSON.parse(d.json) : d.json; if (!c || !c.id) continue;
    if (/^AS-\d{6}-\d{2}$/.test(c.id)) old.push(c.id);
    if (/^(HS|HSP|C24)-/.test(c.id)) continue;
    const k = (c.hist || []).filter(h => h && h.t && !SYS.has(h.who) && h.t >= since && !done.has(keyOf(c.id, h))).length; if (k) { n += k; ids.push(c.id); }
  }
  console.log(JSON.stringify({ pending: n, cases: ids, oldStyleIds: old }));
} else { console.error('mode: plan | check | commit | pending'); process.exit(1); }
