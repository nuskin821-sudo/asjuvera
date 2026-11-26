// 관제탑 tower/as_hyundai(파트너시스템 수집) → 업무판 현대홈쇼핑 칸의 '고객 문의·AS처리' 건. 시트 반품 목록에 이미 있는 주문은 문의 건만 따로 올린다.
// 사용: node tools/hspartner.js <as_hyundai.json> <hs-cases.json(시트)> > hs-partner-cases.json
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const d = raw.data || raw;
const sheet = new Set(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).map(c => c.id.replace('HS-', '').replace(/-/g, '')));
const all = (d.items || []).concat(((d.asProcessing || {}).items) || []);
const out = []; let skipped = 0;
// 고객 답변 초안 (customer-support:draft-response 기준). 실제 발송·반품 승인 여부는 대표·담당 확인 후.
function draft(it) {
  const r = String(it.reason || '');
  const prod = String(it.product || '').replace(/^(\[[^\]]+\])+\s*/, '').replace(/^쥬베라\s*/, '');
  if (/불량|작동/.test(r)) return `안녕하세요 고객님, 쥬베라입니다.\n${prod} 사용 중 작동에 문제가 있어 불편을 드려 죄송합니다.\n\n정확히 확인하기 위해 증상(전원이 켜지지 않음, 중간에 멈춤 등)과 가능하시면 짧은 영상을 남겨 주시겠어요?\n제품을 회수해 확인한 뒤 불량이 맞으면 교환 또는 반품으로 바로 처리해 드리겠습니다.\n\n확인 후 1영업일 안에 다시 안내드리겠습니다.`;
  if (/규정외|사용후|사용 후|불만족|힘이 없|아프|어려/.test(r)) return `안녕하세요 고객님, 쥬베라입니다.\n${prod}이 기대하신 만큼 편하게 쓰기 어려우셨다니 죄송합니다.\n\n사용하신 제품의 반품은 현대홈쇼핑 반품 규정과 제품 상태를 확인한 뒤 가능 여부를 안내드려야 합니다.\n담당자가 확인 후 1영업일 안에 결과를 다시 알려 드리겠습니다.\n\n그 사이 사용이 불편하셨던 점(세기, 무게, 부위 등)을 알려 주시면 더 편하게 쓰시는 방법도 함께 안내드리겠습니다.`;
  return `안녕하세요 고객님, 쥬베라입니다.\n문의 주신 내용 확인했습니다. 담당자가 확인 후 1영업일 안에 다시 안내드리겠습니다.`;
}
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
  if (isAsk) c.draft = draft(it);
  c.hist = [{ t: c.recv, who: '파트너시스템', x: it.kind + ' · ' + (it.step || '') + ' · ' + (it.reason || '') }];
  out.push(c);
}
// 협력사 CS(미답변·미완료): 가장 최근 csOpenMMDD 묶음. 주문번호가 없으므로 번호는 내용으로 만든다(날이 바뀌어도 같은 건이면 같은 번호).
const csKey = Object.keys(d).filter(k => /^csOpen\d{4}$/.test(k)).sort().pop();
const hash4 = t => { let h = 0x811c9dc5; for (const ch of Buffer.from(t, 'utf8')) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0; } return (h % 1679616).toString(36).toUpperCase().padStart(4, '0'); };
let cs = 0;
if (csKey) for (const it of (d[csKey].items || [])) {
  const day = String(d[csKey].readAt || '').slice(0, 10), prod = String(it.product || '').replace(/^(\[[^\]]+\])+\s*/, '').replace(/^쥬베라\s*/, '');
  const c = { id: 'HSP-CS-' + hash4([it.type, it.content, it.product].join('|')), inflow: '현대홈쇼핑', sub: '파트너시스템 · 협력사 CS', recv: day + ' 09:00',
    name: '협력사 CS · ' + (it.type || '문의'), phone: '', addr: '', fam: /베라건/.test(prod) ? '베라건' : /베이직/.test(prod) ? '베이직 미니' : '기타', product: prod, buy: '', shop: '현대홈쇼핑', symptom: it.content || '',
    method: '수거', inTrack: '', outTrack: '', inspect: '', plan: '', alert: null, tin: [], tout: [], rev: 0, sheetTab: '파트너시스템(협력사 CS)', sheetProg: it.status || '', sheetMemo: '',
    stage: 'judge', hsTodo: '현대 협력사 CS 답변 필요', hsOwn: '상담', hsRed: 1, hsWhy: [it.status, it.lastFromHyundai].filter(Boolean).join(' · ').slice(0, 120) };
  c.hist = [it.prevAnswer && { t: c.recv, who: '파트너시스템', x: '이전 답변: ' + it.prevAnswer }, it.lastFromHyundai && { t: c.recv, who: '파트너시스템', x: '현대 요청: ' + it.lastFromHyundai }].filter(Boolean);
  if (!c.hist.length) c.hist = [{ t: c.recv, who: '파트너시스템', x: (it.status || '') + ' · ' + (it.content || '') }];
  out.push(c); cs++;
}
const latest = Object.values(d).map(v => v && v.readAt).concat(d.readAt).filter(Boolean).sort().pop();
fs.writeFileSync(1, JSON.stringify(out));
process.stderr.write(JSON.stringify({ readAt: d.readAt, latestReadAt: latest, partner: all.length, added: out.length, alreadyInSheet: skipped, csOpen: cs }) + '\n');
