// 현대홈쇼핑반품 탭(A:AT 읽은 값) → 업무판 건. 고객 이름·전화·주소는 싣지 않는다.
// 사용: node tools/hs.js <A:AN 값파일> <AP:AT 값파일> <기준시각> > hs-cases.json
const fs = require('fs');
const [fa, fb, at] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(fa, 'utf8')).values, B = JSON.parse(fs.readFileSync(fb, 'utf8')).values;
const now = new Date(at.replace(' ', 'T'));
const g = (r, i) => (r && r[i] != null ? String(r[i]).trim() : '');
const p2 = n => ('0' + n).slice(-2);
const days = s => Math.round((new Date(now.toDateString()) - new Date(new Date(s.replace(' ', 'T')).toDateString())) / 864e5);
const out = [], cnt = {};
for (let i = 2; i < A.length; i++) {
  const r = A[i], x = B[i] || [];
  const order = g(r, 6); if (!order) continue;
  const reqRaw = g(r, 26); if (!reqRaw) continue;
  const m = reqRaw.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/); if (!m) continue;
  const recv = m[1] + ' ' + p2(m[2]) + ':' + m[3];
  const kind = g(r, 20), step = g(r, 21), wh = g(r, 13), opened = g(r, 12), carrier = g(r, 14), inv = g(r, 15), conf = g(r, 28);
  const reasonFull = g(x, 0), reason = reasonFull.split('^')[0], reasonNote = reasonFull.split('^').slice(1).join(' ').trim();
  const channel = g(x, 3) || 'TV';
  const prod = g(r, 3).replace(/^(\[[^\]]+\])+\s*/, '').replace(/^쥬베라\s*/, '');
  const od = order.match(/^(\d{4})(\d{2})(\d{2})/);
  const c = { id: 'HS-' + order, inflow: '현대홈쇼핑', sub: channel + ' · ' + kind, recv, name: '주문 …' + order.slice(-4), phone: '', addr: '',
    fam: /베라건/.test(prod) ? '베라건' : /베이직/.test(prod) ? '베이직 미니' : '기타', product: prod, buy: od ? od[1] + '-' + od[2] + '-' + od[3] : '', shop: '현대홈쇼핑 (' + channel + ')',
    symptom: reason + (reasonNote ? ' · ' + reasonNote.replace(/\d[\d\- ]{6,}\d/g, '***').slice(0, 50) : ''),
    method: '수거', inTrack: inv ? carrier + ' ' + inv : '', outTrack: '', inspect: opened ? '개봉' : '', plan: '', alert: null, tin: [], tout: [], rev: 0,
    sheetTab: '현대홈쇼핑반품', sheetProg: '진행단계: ' + step + (wh ? ' · 상세: ' + (/입고|회수|배송|요청|완료|미개봉|개봉|취소/.test(wh) && !/\d+호|로 \d|동,/.test(wh) ? wh : '(기타 메모)') : '') + (opened ? ' · ' + (/^(개봉|미개봉)$/.test(opened) ? opened : '(메모)') : ''), sheetMemo: '' };
  const tin = t => c.tin.push(t);
  tin({ t: recv, k: 'book', x: '회수요청 (파트너시스템)', loc: '' });
  const inWh = /입고완료|회수완료|회수됨/.test(wh);
  if (/취소/.test(kind) || /회수상품없음/.test(reasonFull)) { c.stage = 'closed'; }
  else if (step === '회수완료') { c.stage = 'done'; if (conf) tin({ t: conf.slice(0, 16), k: 'arrived', x: '회수확정', loc: '' }); else tin({ t: recv, k: 'arrived', x: '회수완료', loc: '' }); }
  else if (inWh) {
    tin({ t: recv, k: 'arrived', x: '창고 입고완료 (시트 표시)', loc: '시흥 배곧' });
    if (/교환/.test(kind)) { c.stage = 'ship'; c.hsTodo = '교환 재출고 확인'; c.hsOwn = '창고'; c.hsRed = 1; c.hsWhy = '교환회수 입고완료 · 재출고 기록 없음'; }
    else { c.stage = 'notify'; c.hsTodo = '입고완료 · 파트너시스템 회수확정 여부 확인'; c.hsOwn = '상담'; }
  } else {
    c.stage = 'transit';
    if (step === '회수집하') { tin({ t: recv, k: 'picked', x: '회수집하', loc: '' });
      if (days(recv) >= 7) { c.hsTodo = '입고 여부 확인 (집하 후 입고 표시 없음)'; c.hsOwn = '상담'; c.hsRed = 1; c.hsWhy = '회수집하 상태로 ' + days(recv) + '일째 · 시트에 입고 표시 없음'; }
      else { c.hsTodo = '회수집하 · 입고 기다림'; c.hsWait = 1; } }
    else if (/배송됨/.test(wh)) { c.hsTodo = '원주문 ' + wh + ' · 회수 기다림'; c.hsWait = 1; }
    else if (days(recv) >= 7) { c.hsTodo = '입고 여부 확인 (시트 상세 칸 비어 있음)'; c.hsOwn = '상담'; c.hsRed = 1; c.hsWhy = '회수요청 ' + days(recv) + '일째 · 시트에 입고 표시 없음'; }
    else if (days(recv) >= 3) { c.hsTodo = '회수 지연 확인'; c.hsOwn = '상담'; c.hsRed = 1; c.hsWhy = '회수요청 ' + days(recv) + '일째 · 집하 기록 없음'; }
    else { c.hsTodo = '회수요청 · 수거 기다림'; c.hsWait = 1; }
  }
  c.hist = [{ t: recv, who: '시트', x: '[현대홈쇼핑반품] ' + c.sheetProg + ' · 사유: ' + c.symptom }];
  const key = c.hsTodo || c.stage; cnt[key] = (cnt[key] || 0) + 1;
  out.push(c);
}
fs.writeFileSync(1, JSON.stringify(out));
process.stderr.write(JSON.stringify({ total: out.length, by: cnt }) + '\n');
