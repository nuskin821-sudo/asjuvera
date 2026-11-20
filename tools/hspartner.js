// 관제탑 tower/as_hyundai(파트너시스템 수집) → 업무판 현대홈쇼핑 칸의 '고객 문의·AS처리' 건. 시트 반품 목록에 이미 있는 주문은 문의 건만 따로 올린다.
// 사용: node tools/hspartner.js <as_hyundai.json> <hs-cases.json(시트)> > hs-partner-cases.json
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const d = raw.data || raw;
const sheet = new Set(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).map(c => c.id.replace('HS-', '').replace(/-/g, '')));
const all = (d.items || []).concat(((d.asProcessing || {}).items) || []);
const out = []; let skipped = 0;
for (const it of all) {
  const ono = String(it.orderNo || '').replace(/[^0-9x]/g, '');
  const isAsk = it.kind === '문의' || it.kind === 'AS';
  if (!isAsk) { if (sheet.has(ono)) { skipped++; continue; } }
  const c = { id: 'HSP-' + ono + '-' + (it.kind || ''), inflow: '현대홈쇼핑', sub: '파트너시스템 · ' + it.kind, recv: it.date + ' 09:00',
    name: '주문 …' + ono.slice(-4), phone: '', addr: '', fam: /베라건/.test(it.product) ? '베라건' : /베이직/.test(it.product) ? '베이직 미니' : '기타',
    product: String(it.product || '').replace(/^(\[[^\]]+\])+\s*/, '').replace(/^쥬베라\s*/, ''), buy: '', shop: '현대홈쇼핑', symptom: it.reason || '',
    method: '수거', inTrack: '', outTrack: '', inspect: '', plan: '', alert: null, tin: [], tout: [], rev: 0, sheetTab: '파트너시스템(1108 수집)', sheetProg: '진행: ' + (it.step || ''), sheetMemo: '' };
  if (isAsk) { c.stage = 'judge'; c.hsTodo = it.kind === 'AS' ? '현대 AS처리 확인' : '현대 고객 문의 답변 확인'; c.hsOwn = '상담'; c.hsRed = 1; c.hsWhy = '파트너시스템 ' + (it.step || '') + ' · ' + String(it.reason || '').slice(0, 60); }
  else { c.stage = 'transit'; c.hsTodo = '파트너시스템 ' + (it.step || '회수요청') + ' · 시트에 없음'; c.hsOwn = '상담'; c.hsRed = 1; c.hsWhy = '파트너시스템 회수 목록에는 있는데 AS 시트 현대홈쇼핑반품 탭에 없음'; }
  c.hist = [{ t: c.recv, who: '파트너시스템', x: it.kind + ' · ' + (it.step || '') + ' · ' + (it.reason || '') }];
  out.push(c);
}
fs.writeFileSync(1, JSON.stringify(out));
process.stderr.write(JSON.stringify({ readAt: d.readAt, partner: all.length, added: out.length, alreadyInSheet: skipped }) + '\n');
