/**
 * 쥬베라 AS 업무판 — 지금 쓰는 AS 구글 시트를 그대로 저장소로 쓰는 프로그램
 *
 * 넣는 곳 : AS 시트(먼저 사본)의 [확장 프로그램 > Apps Script]
 * 배포    : 웹 앱 / 실행 계정 = 웹 앱에 액세스하는 사용자 / 액세스 = Google 계정이 있는 모든 사용자
 * 들어올 수 있는 사람 : 이 시트의 편집 권한이 있고 '직원' 탭에 이메일이 적힌 사람
 *
 * 시트 → 보드 : 직원이 시트에 적은 내용을 읽어 카드로 보여 준다 (탭과 진행사항으로 단계를 판단)
 * 보드 → 시트 : 보드에서 누르면 그 건의 회수여부·문자안내·진행사항·송장번호·비고를 적고, 탭을 옮긴다
 * 시트에 더하는 것 : 각 탭 V열 '보드번호', W열 '보드자료'. 기존 칸은 그대로 둔다.
 */
const OPEN_TABS = ['as', '수거완료', '출고예정', '유상AS입금대기', '보류'];
const DONE_TAB = '처리완료';
const DONE_ROWS = 150;            // 완료 건은 최근 것만 보드에 보여 준다
const CUTOFF = '2026-06-01';      // 이 날짜 전에 접수된 건은 보드에 올리지 않는다 (대표 결정: 종결)
const TAB_STAFF = '직원', TAB_SET = '설정';
const NCOL = 23, COL_ID = 22, COL_JSON = 23;   // V, W
// 열 순서(0부터): 접수일자, 신청일자, 성함, 연락처, 주소, 제품명, 구매일자, 구입처, A/S 사유, 회수여부, 문자안내, 진행사항, 출고일자, 송장번호, 비고
const I = { date: 0, applied: 1, name: 2, phone: 3, addr: 4, product: 5, buy: 6, shop: 7, symptom: 8, k: 9, m: 10, prog: 11, out: 12, track: 13, note: 14 };
const FAIL_WORDS = ['수거안됨', '수거 안됨', '수거 안되', '집화안됨', '집화 안됨', '집하안됨', '집하 안됨', '재수거'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index').setTitle('쥬베라 AS 업무판')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function p2_(n) { return ('0' + n).slice(-2); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }

/* ---------- 직원·설정 ---------- */
function tab_(name, head) {
  let sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]); sh.setFrozenRows(1); }
  return sh;
}
function staffRows_() {
  return tab_(TAB_STAFF, ['이메일', '이름', '역할(상담/창고/대표)']).getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
}
function user_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('구글 계정을 확인할 수 없습니다. 구글에 로그인한 뒤 다시 열어 주세요.');
  const rows = staffRows_();
  if (!rows.length) { ss_().getSheetByName(TAB_STAFF).appendRow([email, '관리자', '대표']); return { email: email, name: '관리자', role: '대표' }; }
  const r = rows.filter(function (x) { return String(x[0]).trim().toLowerCase() === email; })[0];
  if (!r) throw new Error('등록되지 않은 계정입니다: ' + email);
  return { email: email, name: String(r[1] || email), role: String(r[2] || '상담').trim() };
}

/* ---------- 시트 글자 → 보드 값 ---------- */
function date_(s) { // '2026. 11. 9', '2026-11-09 8:06:51', '2025.11.10.', '22.1.20' → 'YYYY-MM-DD'
  s = String(s || '');
  let m = s.match(/(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/);
  if (m) return m[1] + '-' + p2_(m[2]) + '-' + p2_(m[3]);
  m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (m) return '20' + m[1] + '-' + p2_(m[2]) + '-' + p2_(m[3]);
  return '';
}
function time_(s) { const m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? p2_(m[1]) + ':' + m[2] : ''; }
function fam_(p) {
  const t = String(p || '').replace(/\s/g, '');
  const map = [['신형뷰러', '신형뷰러'], ['구형뷰러', '구형뷰러'], ['프리미엄', '프리미엄 플러스'], ['트라이', '트라이'], ['트리플', '트리플'], ['베이직', '베이직 미니'], ['딥웨이브', '듀얼 딥웨이브'], ['베라건', '베라건'], ['피지', '피지흡입기']];
  for (let i = 0; i < map.length; i++) if (t.indexOf(map[i][0]) >= 0) return map[i][1];
  return '기타';
}
function inflow_(applied) {
  const s = String(applied || '');
  if (/^\d{4}\D/.test(s)) return ['아임웹', 'AS 신청서'];
  if (s.indexOf('톡톡') >= 0) return ['네이버', '톡톡'];
  if (s.indexOf('네이버') >= 0 || s.indexOf('스마트스토어') >= 0) return ['네이버', s];
  if (s.indexOf('카톡') >= 0 || s.indexOf('카카오') >= 0) return ['카카오톡', '채널 상담'];
  if (s.indexOf('전화') >= 0) return ['전화', '전화 접수'];
  return ['기타', s || '직접 입력'];
}
function has_(s, words) { for (let i = 0; i < words.length; i++) if (String(s).indexOf(words[i]) >= 0) return true; return false; }

/** 탭과 칸의 글자로 단계를 판단한다 */
function derive_(tab, v) {
  const k = v[I.k], m = v[I.m], prog = v[I.prog];
  if (tab === '수거완료') return { stage: 'inspect' };
  if (tab === '유상AS입금대기') { // 고객이 유상 진행을 안 하기로 한 건은 제품 처리(반송·폐기) 확인이 남은 것
    if (has_(prog, ['안함', '안 함', '안한다', '폐기'])) return { stage: 'hold', unknown: true };
    if (!k && !m) return { stage: 'hold', unknown: true };
    return { stage: 'pay' };
  }
  if (tab === '출고예정') return { stage: has_(prog, ['출고완료', '발송완료']) ? 'done' : 'ship' };
  if (tab === '보류') return { stage: 'hold' };
  if (tab === DONE_TAB) return { stage: 'done' };
  // 'as' 탭
  if (has_(v[I.note], ['취소']) || has_(prog, ['출고됨'])) return { stage: 'closed' };   // 비고에 취소라고 적힌 건, 이미 새 제품이 나간 건
  if (has_(prog, ['사무실 배송완료'])) return { stage: 'inspect' };   // 제품이 사무실에 도착함
  if (has_(prog, ['교환철회', '교환취소'])) return { stage: 'closed' };
  if (has_(prog, FAIL_WORDS)) return { stage: 'transit', fail: true };
  if (has_(prog, ['상담중', '상담 중'])) return { stage: 'hold' };
  if (has_(prog, ['유상AS 안됨', '유상AS 안된', '취소', '중복', '구매 링크'])) return { stage: 'closed' };
  if (has_(prog, ['보류', '요망', '확인'])) return { stage: 'hold' };
  if (!k && !m) return { stage: 'judge', unknown: !!prog };
  if (m !== '안내완료') return { stage: 'pickup', unknown: !!prog };
  return { stage: 'transit', method: k === '제품 발송안내 필요' ? '고객발송' : '수거', unknown: !!prog };
}

/** 시트 한 줄 → 보드 한 건. 보드자료(JSON)가 있고 시트가 그대로면 보드 단계를 믿고, 직원이 시트를 바꿨으면 시트를 따른다. */
function toCase_(tab, v) {
  const recvD = date_(v[I.applied]) || date_(v[I.date]);
  const recv = recvD + ' ' + (date_(v[I.applied]) ? (time_(v[I.applied]) || '09:00') : '09:00');
  const io = inflow_(v[I.applied]);
  let b = null;
  try { b = v[COL_JSON - 1] ? JSON.parse(v[COL_JSON - 1]) : null; } catch (e) { b = null; }
  const c = b || { method: '수거', inTrack: '', inspect: '', plan: '', alert: null, hist: [], tin: [], tout: [], rev: 0 };
  let changed = false;
  const same = b && b._tab === tab && b._k === v[I.k] && b._m === v[I.m] && b._prog === v[I.prog];
  if (!same) {
    const d = derive_(tab, v);
    if (b && b.stage !== d.stage) c.hist.push({ t: now_(), who: '시트', x: '시트에서 바뀜 → 탭 [' + tab + ']' + (v[I.prog] ? ', 진행사항 [' + v[I.prog] + ']' : '') });
    c.stage = d.stage;
    if (d.method) c.method = d.method;
    c.alert = d.fail ? { type: 'fail', x: '시트 진행사항: ' + v[I.prog] } : null;
    c.sheetNote = d.unknown ? '시트 진행사항 확인: ' + v[I.prog] : '';
    if (c.stage === 'pay' && !c.payAsk) { const md = String(v[I.out]).match(/(\d{1,2})\/(\d{1,2})/); c.payAsk = md ? recvD.slice(0, 4) + '-' + p2_(md[1]) + '-' + p2_(md[2]) : recvD; }
    if ((c.stage === 'notify' || c.stage === 'pay' || c.stage === 'ship') && !c.inspect) c.inspect = String(v[I.note] || '').split('/')[0];
    c._tab = tab; c._k = v[I.k]; c._m = v[I.m]; c._prog = v[I.prog];
    changed = true;
  }
  // 기본 정보는 항상 시트 칸이 기준
  c.id = v[COL_ID - 1]; c.recv = recv; c.inflow = io[0]; c.sub = io[1];
  c.name = v[I.name]; c.phone = v[I.phone]; c.addr = v[I.addr]; c.product = v[I.product]; c.fam = fam_(v[I.product]);
  c.buy = date_(v[I.buy]); c.buyText = v[I.buy]; c.shop = v[I.shop]; c.symptom = v[I.symptom];
  c.outTrack = v[I.track]; c.sheetTab = tab; c.sheetProg = v[I.prog]; c.sheetMemo = v[I.note];
  return { c: c, changed: changed };
}

function head_(sh) { // V1, W1 에 보드 칸 제목을 단다
  const h = sh.getRange(1, COL_ID, 1, 2).getDisplayValues()[0];
  if (h[0] === '보드번호') return;
  if (h[0] || h[1]) throw new Error('[' + sh.getName() + '] 탭의 V·W열에 다른 내용이 있습니다. 비워 주세요.');
  if (sh.getMaxColumns() < NCOL) sh.insertColumnsAfter(sh.getMaxColumns(), NCOL - sh.getMaxColumns());
  sh.getRange(1, COL_ID, 1, 2).setValues([['보드번호', '보드자료']]);
}
function rows_(sh, from) {
  const n = sh.getLastRow();
  from = Math.max(2, from || 2);
  if (n < from) return [];
  return sh.getRange(from, 1, n - from + 1, NCOL).getDisplayValues().map(function (v, i) { return { row: from + i, v: v }; });
}

/** 시트를 읽어 보드 건 목록을 만든다. 새로 생긴 줄에는 보드번호를 붙이고, 직원이 바꾼 줄은 보드자료를 고쳐 적는다. */
function sync_() {
  const out = [], ids = {}, todo = [];
  const tabs = OPEN_TABS.map(function (name) { const sh = ss_().getSheetByName(name); if (sh) head_(sh); return { name: name, sh: sh, rows: sh ? rows_(sh) : [] }; });
  tabs.forEach(function (t) { t.rows.forEach(function (r) { if (r.v[COL_ID - 1]) ids[r.v[COL_ID - 1]] = 1; }); });
  tabs.forEach(function (t) {
    t.rows.forEach(function (r) {
      const v = r.v;
      if (!v[I.name] && !v[I.product]) return;
      const d = date_(v[I.date]) || date_(v[I.applied]);
      if (!d || d < CUTOFF) return;
      let newId = false;
      if (!v[COL_ID - 1]) {
        const pre = 'AS-' + d.slice(2).replace(/-/g, '') + '-';
        let n = 1; while (ids[pre + p2_(n)]) n++;
        v[COL_ID - 1] = pre + p2_(n); ids[v[COL_ID - 1]] = 1; newId = true;
      }
      const x = toCase_(t.name, v);
      if (newId && !x.c.hist.length) x.c.hist.push({ t: x.c.recv, who: '시트', x: '시트에서 가져옴 (탭 [' + t.name + '])' });
      out.push(x.c);
      if (newId || x.changed) todo.push({ sh: t.sh, row: r.row, c: x.c });
    });
  });
  todo.forEach(function (w) { try { w.sh.getRange(w.row, COL_ID, 1, 2).setValues([[w.c.id, JSON.stringify(w.c)]]); } catch (e) { /* 보기 권한만 있는 사람은 적지 못한다 */ } });
  const done = ss_().getSheetByName(DONE_TAB);
  if (done) rows_(done, done.getLastRow() - DONE_ROWS + 1).forEach(function (r) {
    const v = r.v; if (!v[I.name] && !v[I.product]) return;
    if (!v[COL_ID - 1]) v[COL_ID - 1] = 'DONE-' + r.row;
    const c = toCase_(DONE_TAB, v).c; c.stage = 'done'; out.push(c);
  });
  return out.map(function (c) { return JSON.stringify(c); });
}

function boot() {
  const u = user_();
  const roleNames = {};
  staffRows_().forEach(function (r) { const role = String(r[2]).trim(); if ((role === '상담' || role === '창고') && !roleNames[role]) roleNames[role] = String(r[1]); });
  const settings = {};
  const set = tab_(TAB_SET, ['항목', '값']);
  if (set.getLastRow() < 2) set.appendRow(['입금계좌', '']);
  set.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0] === '입금계좌') settings.account = String(r[1] || ''); });
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return { user: u, roleNames: roleNames, settings: settings, cases: sync_() }; } finally { lock.releaseLock(); }
}
function getCases() {
  user_();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return sync_(); } finally { lock.releaseLock(); }
}

/* ---------- 보드 → 시트 ---------- */
function md_(d) { const m = String(d || now_()).match(/\d{4}-(\d{2})-(\d{2})/); return Number(m[1]) + '/' + Number(m[2]); }
/** 단계에 맞는 탭과 칸의 글자. undefined 는 "그대로 둔다" */
function cells_(c, cur) {
  const fee = c.fee ? (c.fee / 10000) + '만 ' : '';
  switch (c.stage) {
    case 'judge': return { tab: 'as' };
    case 'pickup': return { tab: 'as', k: '수거접수 필요' };
    case 'transit': return { tab: 'as', k: c.method === '고객발송' ? '제품 발송안내 필요' : '수거접수 필요', m: '안내완료',
      prog: c.alert && c.alert.type === 'fail' ? '수거안됨' : (has_(cur[I.prog], FAIL_WORDS) ? '' : undefined) };
    case 'inspect': return { tab: '수거완료', k: '회수완료', m: '안내완료', prog: '개봉·검사 필요' };
    case 'notify': return { tab: '수거완료', k: '회수완료', prog: '고객 안내 필요', note: c.inspect };
    case 'pay': return { tab: '유상AS입금대기', k: '회수완료', prog: fee + '유상AS 비용 입금전', out: md_(c.payAsk) + ' 알림', note: c.inspect };
    case 'ship': return { tab: '출고예정', k: '회수완료', prog: c.plan === 'paid' ? '보상판매 출고예정' : (c.plan === 'free' ? '출고예정' : '착불 출고예정'), note: c.inspect };
    case 'done': return { tab: DONE_TAB, k: '회수완료', prog: c.plan === 'paid' ? '보상판매 출고완료' : (c.plan === 'free' ? '출고완료' : '착불 재발송완료'), out: c.plan === 'returned' ? undefined : md_() + ' 안내', track: c.outTrack, note: c.inspect };
    case 'hold': return { tab: '보류' };
    case 'closed': return { tab: cur ? undefined : 'as', prog: c.closeWhy || 'AS접수 취소' };
  }
  return {};
}
function find_(id) {
  const names = OPEN_TABS.concat([DONE_TAB]);
  for (let t = 0; t < names.length; t++) {
    const sh = ss_().getSheetByName(names[t]); if (!sh) continue;
    const n = sh.getLastRow(); if (n < 2) continue;
    const from = names[t] === DONE_TAB ? Math.max(2, n - DONE_ROWS - 50) : 2;
    const col = sh.getRange(from, COL_ID, n - from + 1, 1).getDisplayValues();
    for (let i = 0; i < col.length; i++) if (col[i][0] === id) return { sh: sh, tab: names[t], row: from + i };
  }
  return null;
}

/** 한 건 저장. 새 건은 'as' 탭 맨 아래에 줄을 만들고, 있던 건은 칸을 고치고 필요하면 탭을 옮긴다. */
function saveCase(json) {
  const u = user_();
  const c = JSON.parse(json);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    let pos, v;
    if (String(c.id).indexOf('NEW-') === 0) {
      const sh = ss_().getSheetByName('as'); head_(sh);
      const d = String(c.recv).slice(0, 10), pre = 'AS-' + d.slice(2).replace(/-/g, '') + '-';
      const ids = {}; OPEN_TABS.forEach(function (name) { const s = ss_().getSheetByName(name); if (s) rows_(s).forEach(function (r) { ids[r.v[COL_ID - 1]] = 1; }); });
      let n = 1; while (ids[pre + p2_(n)]) n++;
      c.id = pre + p2_(n); c.rev = 0;
      const p = d.split('-');
      const applied = c.inflow === '카카오톡' ? '카톡 AS접수' : c.inflow === '네이버' ? '톡톡 AS접수' : c.inflow === '전화' ? '전화 AS접수' : c.recv + ':00';
      v = []; for (let i = 0; i < NCOL; i++) v.push('');
      v[I.date] = p[0] + '. ' + Number(p[1]) + '. ' + Number(p[2]); v[I.applied] = applied;
      v[I.name] = c.name; v[I.phone] = c.phone; v[I.addr] = c.addr || ''; v[I.product] = c.product; v[I.buy] = c.buy || ''; v[I.shop] = c.shop || ''; v[I.symptom] = c.symptom || '';
      const row = sh.getLastRow() + 1;
      sh.getRange(row, 1, 1, NCOL).setNumberFormat('@').setValues([v]);
      pos = { sh: sh, tab: 'as', row: row };
    } else {
      pos = find_(c.id);
      if (!pos) throw new Error('시트에서 이 건을 찾을 수 없습니다: ' + c.id);
      v = pos.sh.getRange(pos.row, 1, 1, NCOL).getDisplayValues()[0];
      let stored = 0; try { stored = Number(JSON.parse(v[COL_JSON - 1]).rev) || 0; } catch (e) { stored = 0; }
      if (stored !== (Number(c.rev) || 0)) throw new Error('다른 사람이 먼저 수정했습니다');
      // 보드에서 고친 기본 정보만 시트 칸에 적는다
      const cur = toCase_(pos.tab, v.slice()).c;
      [['name', I.name], ['phone', I.phone], ['addr', I.addr], ['product', I.product], ['shop', I.shop], ['symptom', I.symptom]].forEach(function (f) { if (c[f[0]] !== undefined && c[f[0]] !== cur[f[0]]) v[f[1]] = c[f[0]]; });
      if ((c.buy || '') !== (cur.buy || '')) v[I.buy] = c.buy || '';
    }
    const t = cells_(c, v);
    if (t.k !== undefined) v[I.k] = t.k;
    if (t.m !== undefined) v[I.m] = t.m;
    if (t.prog !== undefined) v[I.prog] = t.prog;
    if (t.out !== undefined) v[I.out] = t.out;
    if (c.sheetK) v[I.k] = c.sheetK;                 // 담당자가 접수 자료에서 직접 고른 회수여부·진행사항이 우선
    if (c.sheetP) v[I.prog] = c.sheetP;
    if (c.payType && /ship|done/.test(c.stage) && !/선불|착불/.test(v[I.prog])) v[I.prog] = c.payType + ' ' + v[I.prog];
    if (c.stage === 'done' && c.plan === 'returned') v[I.prog] = '반품 회수 완료';
    if (t.note !== undefined && t.note) v[I.note] = t.note;
    if (t.track !== undefined && t.track) v[I.track] = t.track; else if (c.outTrack) v[I.track] = c.outTrack;
    const tab = t.tab || pos.tab;
    c.rev = (Number(c.rev) || 0) + 1;
    c._tab = tab; c._k = v[I.k]; c._m = v[I.m]; c._prog = v[I.prog];
    c.savedBy = u.name; c.savedAt = now_();
    v[COL_ID - 1] = c.id; v[COL_JSON - 1] = JSON.stringify(c);
    if (tab === pos.tab) {
      pos.sh.getRange(pos.row, 1, 1, NCOL).setValues([v]);
    } else { // 탭 옮기기: 옮길 탭 맨 아래에 적고, 원래 줄을 지운다
      const to = ss_().getSheetByName(tab); head_(to);
      to.getRange(to.getLastRow() + 1, 1, 1, NCOL).setNumberFormat('@').setValues([v]);
      pos.sh.deleteRow(pos.row);
    }
    return { id: c.id, rev: c.rev };
  } finally { lock.releaseLock(); }
}
