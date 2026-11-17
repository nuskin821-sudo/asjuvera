/**
 * 쥬베라 AS 업무판 — 구글 시트를 저장소로 쓰는 프로그램
 * 이 코드는 저장용 구글 시트의 [확장 프로그램 > Apps Script] 안에 넣습니다.
 * 배포: 웹 앱 / 실행 계정 = 웹 앱에 액세스하는 사용자 / 액세스 = Google 계정이 있는 모든 사용자
 * 들어올 수 있는 사람 = 이 시트의 편집 권한이 있고 '직원' 탭에 이메일이 적힌 사람
 */
const TAB_CASE = '건', TAB_STAFF = '직원', TAB_SET = '설정';
const CASE_HEAD = ['접수번호', '분류', '상태', '접수일시', '인입경로', '세부채널', '고객명', '연락처', '제품', '회수송장', '출고송장', '수정시각', '수정자', 'rev', '자료(JSON)'];
const STAGE_KO = { judge: '접수 확인·판정', pickup: '수거 접수', transit: '수거·이동', inspect: '개봉·검사', notify: '고객 안내', pay: '입금 기다림', ship: '출고', done: '완료', hold: '보류', closed: '종결' };

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('쥬베라 AS 업무판')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function tab_(name, head) {
  let sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@'); // 전화번호 앞자리 0이 지워지지 않게 글자로 저장
  }
  return sh;
}

/** 처음 한 번: 필요한 탭을 만든다. 메뉴에서 직접 실행해도 된다. */
function setup() {
  tab_(TAB_CASE, CASE_HEAD);
  tab_(TAB_STAFF, ['이메일', '이름', '역할(상담/창고/대표)']);
  const s = tab_(TAB_SET, ['항목', '값']);
  if (s.getLastRow() < 2) s.appendRow(['입금계좌', '']);
}

function staffRows_() {
  return ss_().getSheetByName(TAB_STAFF).getDataRange().getValues().slice(1).filter(function (r) { return r[0]; });
}

/** 지금 들어온 사람. '직원' 탭에 없으면 막는다. 탭이 비어 있으면 처음 연 사람을 대표로 등록한다. */
function user_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('구글 계정을 확인할 수 없습니다. 구글에 로그인한 뒤 다시 열어 주세요.');
  setup();
  const rows = staffRows_();
  if (!rows.length) {
    ss_().getSheetByName(TAB_STAFF).appendRow([email, '대표', '대표']);
    return { email: email, name: '대표', role: '대표' };
  }
  const r = rows.filter(function (x) { return String(x[0]).trim().toLowerCase() === email; })[0];
  if (!r) throw new Error('등록되지 않은 계정입니다: ' + email);
  return { email: email, name: String(r[1] || email), role: String(r[2] || '상담').trim() };
}

function list_() {
  const sh = ss_().getSheetByName(TAB_CASE);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, CASE_HEAD.length, n - 1, 1).getValues().map(function (r) { return r[0]; }).filter(String);
}

/** 화면을 열 때 한 번 부른다 */
function boot() {
  const u = user_();
  const roleNames = {};
  staffRows_().forEach(function (r) { const role = String(r[2]).trim(); if ((role === '상담' || role === '창고') && !roleNames[role]) roleNames[role] = String(r[1]); });
  const settings = {};
  ss_().getSheetByName(TAB_SET).getDataRange().getValues().slice(1).forEach(function (r) { if (r[0] === '입금계좌') settings.account = String(r[1] || ''); });
  return { user: u, roleNames: roleNames, settings: settings, cases: list_() };
}

/** 1분마다 새 자료를 가져올 때 부른다 */
function getCases() { user_(); return list_(); }

function row_(c, u) {
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  return [c.id, c.inflow === '현대홈쇼핑' ? '현대홈쇼핑' : '일반 AS', STAGE_KO[c.stage] || c.stage, c.recv, c.inflow, c.sub, c.name, c.phone, c.product, c.inTrack || '', c.outTrack || '', now, u.name, String(c.rev), JSON.stringify(c)];
}

/** 한 건 저장. 새 건이면 접수번호를 붙이고, 있던 건이면 다른 사람이 먼저 고쳤는지 확인한다. */
function saveCase(json) {
  const u = user_();
  const c = JSON.parse(json);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(TAB_CASE);
    const n = sh.getLastRow();
    const ids = n < 2 ? [] : sh.getRange(2, 1, n - 1, 1).getValues().map(function (r) { return String(r[0]); });
    if (String(c.id).indexOf('NEW-') === 0) {
      const prefix = (c.inflow === '현대홈쇼핑' ? 'HS-' : 'AS-') + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd') + '-';
      let max = 0;
      ids.forEach(function (id) { if (id.indexOf(prefix) === 0) max = Math.max(max, Number(id.slice(prefix.length)) || 0); });
      c.id = prefix + ('0' + (max + 1)).slice(-2);
      c.rev = 1;
      sh.getRange(n + 1, 1, 1, CASE_HEAD.length).setValues([row_(c, u)]);
    } else {
      const i = ids.indexOf(String(c.id));
      if (i < 0) throw new Error('접수번호를 찾을 수 없습니다: ' + c.id);
      const stored = Number(sh.getRange(i + 2, 14).getValue()) || 0;
      if (stored !== (Number(c.rev) || 0)) throw new Error('다른 사람이 먼저 수정했습니다');
      c.rev = stored + 1;
      sh.getRange(i + 2, 1, 1, CASE_HEAD.length).setValues([row_(c, u)]);
    }
    return { id: c.id, rev: c.rev };
  } finally {
    lock.releaseLock();
  }
}
