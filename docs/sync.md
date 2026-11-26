# 업무판 → AS 시트 반영 (대표 지시 11/25: "지금 실무하고 있다 바로 동기화, 오작동 안 나게", "직원이 원래 방식대로 해도 문제 안 생기게, 또는 인지하게")

업무판(https://claude.ai/artifact/XgGaMVtuRSbui5Q8zJ8GeL)에서 직원이 누른 작업·메모를 AS 시트(1vk--EPUrq19aVeRVmowSitoJblQE9d9Ys08pDTRl6xE)에 옮긴다.

## 도는 시간과 보고 (대표 지시 11/26)
- 평일 낮 12:05부터 저녁 6:05까지 **10분마다** 돈다(예약 6개: 매시 5·15·25·35·45·55분. 한 예약은 1시간 간격까지만 되므로 여섯 개로 나눴다).
- **할 일만 하고 보고하지 않는다.** 대화에 결과를 적지 않고, 원장에도 회차마다 쓰지 않는다. 하루 합계는 저녁 갱신(17:13) 원장 한 줄에 같이 적는다.
- **문제가 생겼을 때만** 대표님께 한 줄로 알린다. 같은 문제는 다시 알리지 않는다.

## 지키는 것
- 직원이 쓰는 칸(A~O)은 고치지 않는다. 비어 있는 **출고일자(M)·송장번호(N)** 만 채운다.
- 메모·작업 기록은 **P열 '업무판 메모'** 에만 쓴다(기존 글 뒤에 덧붙임).
- 줄은 **Q열 '접수번호'** 로 찾는다. 직원이 이름·제품을 고치거나 줄을 다른 탭으로 옮겨도 번호가 따라간다. 번호가 아직 없는 줄은 접수일·이름·제품이 딱 한 줄 맞을 때만 쓰고, 그때 번호도 붙인다.
- 번호가 맞아도 접수일·이름·제품 셋 중 둘 이상이 다르면 쓰지 않는다.
- 같은 건이 여러 탭에 있으면(줄을 복사해 둔 경우) 진행이 더 나간 탭의 줄에만 쓴다(보류 < as < 수거완료 < 유상AS입금대기 < 출고예정 < 처리완료). 남은 줄은 '중복'으로 알린다.
- as 탭 건에 '수거 완료 확인' 또는 '창고 도착 확인'이 찍히면 그 줄을 **수거완료 탭**으로 옮긴다.
- Q칸에 직원이 다른 글을 적어 둔 줄은 번호를 덮어쓰지 않는다.
- 현대홈쇼핑(HS-, HSP-)·카페24(C24-) 건은 시트에 쓰지 않는다. 현대홈쇼핑반품 탭은 읽기만.
- 쓴 뒤 전체를 다시 읽어 `check`가 전부 OK인지 본다. BAD가 하나라도 있으면 바로 고치고 대표님께 알린다.
- 못 넣은 건·중복 줄은 업무판에 빨갛게 보이게 한다(`cases/_sync` 문서).
- 업무판을 올릴 때는 **고친 파일의 문법 검사·화면 확인을 먼저 끝내고 그다음에** 올린다(같은 단계에서 고치면서 올리지 않는다).
- 고객 이름·전화·주소는 원장·보고에 적지 않는다(접수번호와 상태만).

## 순서
1. 업무판 저장분 중 **바뀐 것만** 읽는다: `ArtifactData query` (url 위, collection `cases`, query `{"limit":500,"where":[["at",">=","<지난 회차 시각 또는 어제 날짜 00:00>"]]}`, **out_dir은 회차마다 새 폴더** 예: `/home/user/as-data/db-MMDD-HHMM`). 같은 폴더를 다시 쓰면 예전 파일이 남아 새로 받아 오지 않는다. 전체 `list`는 화면에 너무 많이 나오므로 쓰지 않는다. 아래 명령의 `dbNOW/cases` 자리에 이 폴더의 `cases`를 넣는다.
2. 밀린 것 있는지: `node tools/sync.js pending /home/user/as-data/dbNOW/cases /home/user/as-data/sync/state.json "2026-11-25 00:00"`
   - `pending` 0이고 `oldStyleIds`가 비었으면 **여기서 끝**(시트를 읽지 않는다).
   - `oldStyleIds`(AS-yymmdd-NN 꼴)가 있으면 옛 화면에서 저장된 것 → `tools/dbfix.js`로 새 번호로 옮긴다(목록 출력의 version을 if_version으로).
3. 시트 읽기(값만, 파일로 저장됨): `get_spreadsheet` includeGridData, ranges `as!A1:Q200`, `수거완료!A1:Q400`, `출고예정!A1:Q200`, `유상AS입금대기!A1:Q300`, `보류!A1:Q2070`, `처리완료!A1000:Q1700`, fields `sheets.properties.title`, `sheets.properties.sheetId`, `sheets.properties.gridProperties`, `sheets.data.rowData.values.formattedValue`.
4. 계획: `tools/syncplan.sh plan <3의 파일> /home/user/as-data/dbNOW/cases` → 줄마다 `탭!P행`과 P값, '번호 붙이기' 범위가 나온다(값은 `/home/user/as-data/sync/qfill.json`).
5. 쓰기 직전 확인: 메모를 쓸 줄의 `C:F`를 `get_values`로 읽어 이름·제품이 계획과 같은지 본다. 다르면 3부터 다시.
6. 쓰기
   - 메모·송장·옮김: `update_spreadsheet` 한 번에(전부 되거나 전부 안 됨).
     - P칸: `updateCells` start {sheetId, rowIndex: 행-1, columnIndex: 15}, stringValue = 계획의 P값, fields `userEnteredValue`
     - M·N: 같은 방식 columnIndex 12·13 (계획에 M=/N=이 있을 때만)
     - 옮김: `copyPaste` as 그 줄(A:Q, endColumnIndex 17) → 수거완료 '옮김 행', PASTE_NORMAL → `deleteDimension` as 그 줄 → `appendDimension` as 1줄. 여러 줄이면 **아래 줄부터** 지운다(계획이 그 순서로 나온다).
     - sheetId: as 111783976 · 수거완료 1856335090 · 출고예정 870760180 · 유상AS입금대기 691211646 · 보류 220357409 · 처리완료 841485114
   - 번호 붙이기: 탭마다 `update_values` 한 번, range와 values는 qfill.json 그대로(null 칸은 건너뛴다).
7. 다시 읽기(3과 같음. 한두 칸만 썼으면 그 칸의 `P:Q`만 다시 읽어 번호와 글이 맞는지 봐도 된다) → `tools/syncplan.sh check <새 파일>` 이 전부 OK → `node tools/sync.js commit /home/user/as-data/sync/plan.json /home/user/as-data/sync/state.json`
8. 상태 알리기: `tools/syncstatus.sh <쓴 줄 수>` → `ArtifactData get`(cases/_sync)로 version을 보고 `set`(file_path `/home/user/as-data/sync/_sync.json`, if_version). 업무판 위에 "시트 반영 시각 · 못 넣은 건 · 두 줄인 건"이 뜬다.
9. 회차마다 보고하지 않는다(위 '도는 시간과 보고'). 쓴 줄 수는 `/home/user/as-data/sync/day.log`에 한 줄씩 덧붙여 두고 저녁 갱신 때 합쳐서 원장에 적는다.

## 매일 저녁 갱신(tools/daily.sh)과의 관계
- 저녁 갱신 때도 시트를 `A:Q`로 읽는다. 업무판 번호는 Q열 번호를 그대로 쓴다(`tools/rows.js`).
- 번호가 없는 새 줄은 접수일·이름·제품으로 번호를 만들고(AS-yymmdd-XXXX, `tools/ids.js`), 다음 반영 때 Q열에 적는다.

## 11/25에 한 일
- 옛 번호(줄 순서로 매긴 AS-yymmdd-NN)는 날마다 바뀌어 17건에서 다른 고객 건을 가리고 있었다 → 업무판 저장분 95건을 내용 기준 새 번호 88건으로 옮김(겹친 7쌍은 합침).
- 시트에 P열 '업무판 메모', Q열 '접수번호' 머리글을 넣고, 진행 중 탭과 보류 탭(6월 이후) 97줄에 번호를 붙임. 확인 97/97.
