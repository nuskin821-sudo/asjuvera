// 사무실 서버 tower-ascafe24 응답 → 업무판 건(일반 AS 칸). 본문·개인정보 없음.
// 사용: node tools/cafe24.js <응답.json> > cafe24-cases.json
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = (r.items || []).map(it => {
  const id = it.boardNo ? 'C24-' + it.boardNo : 'C24-' + (it.orderNo || it.date);
  const c = { id, inflow: '자사몰 게시판', sub: it.kind + (it.title ? ' · ' + it.title.replace(/\*/g, '') : ''), recv: it.date + ' 09:00',
    name: it.boardNo ? '게시글 ' + it.boardNo : '주문 …' + String(it.orderNo || '').slice(-4), phone: '', addr: '', fam: '기타', product: it.product || '(상품 미지정)',
    buy: '', shop: '자사몰', symptom: it.kind + ' · ' + (it.title || '').replace(/\*/g, ''), method: '수거', inTrack: '', outTrack: '', inspect: '', plan: '', alert: null, tin: [], tout: [], rev: 0,
    sheetTab: '카페24 게시판', sheetProg: it.answered ? '답변 완료' : '답변 없음', sheetMemo: '' };
  if (it.answered) c.stage = 'done';
  else { c.stage = 'judge'; c.hsTodo = '게시판 ' + it.kind + ' 확인 (답변 없음)'; c.hsOwn = '상담'; c.hsRed = 1; c.hsWhy = it.date + ' 등록 · 답변 없음 (답글은 대표 결정 전까지 하지 않음)'; }
  c.hist = [{ t: c.recv, who: '카페24', x: it.kind + ' · ' + (it.answered ? '답변 완료' : '답변 없음') }];
  return c;
});
fs.writeFileSync(1, JSON.stringify(out));
process.stderr.write(JSON.stringify({ readAt: r.readAt, count: out.length, unanswered: out.filter(c => c.stage !== 'done').length }) + '\n');
