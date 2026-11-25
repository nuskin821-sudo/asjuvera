# 업무판 → AS 시트 반영 (대표 지시 11/25: "지금 실무하고 있다 바로 동기화, 오작동 안 나게")

업무판(https://claude.ai/artifact/XgGaMVtuRSbui5Q8zJ8GeL)에서 직원이 누른 작업·메모를 AS 시트(1vk--EPUrq19aVeRVmowSitoJblQE9d9Ys08pDTRl6xE)에 옮긴다.

## 지키는 것
- 직원이 쓰는 칸(A~O)은 고치지 않는다. 비어 있는 **출고일자(M)·송장번호(N)** 만 채운다.
- 메모·작업 기록은 **P열 '업무판 메모'** 에만 쓴다(기존 글 뒤에 덧붙임).
- 줄은 위치가 아니라 **접수일·이름·제품**으로 찾는다. 딱 한 줄만 맞을 때만 쓴다. 0줄·여러 줄이면 건너뛰고 보고한다.
- as 탭 건에 '수거 완료 확인' 또는 '창고 도착 확인'이 찍히면 그 줄을 **수거완료 탭**으로 옮긴다.
- 현대홈쇼핑(HS-, HSP-)·카페24(C24-) 건은 시트에 쓰지 않는다. 현대홈쇼핑반품 탭은 읽기만.
- 쓰기 직전에 그 줄을 다시 읽어 확인하고, 쓴 뒤 전체를 다시 읽어 `check`가 전부 OK인지 본다. BAD가 하나라도 있으면 바로 고치고 대표님께 알린다.
- 고객 이름·전화·주소는 원장·보고에 적지 않는다(접수번호와 상태만).

## 순서
1. 업무판 저장분 읽기: `ArtifactData list` (url 위, collection `cases`, query limit 500, **out_dir `/home/user/as-data/dbNOW`**). 내용은 화면에 띄우지 않는다.
2. 밀린 것 있는지: `node tools/sync.js pending /home/user/as-data/dbNOW/cases /home/user/as-data/sync/state.json "2026-11-25 00:00"`
   - `pending` 0이고 `oldStyleIds`가 비었으면 **여기서 끝**(시트를 읽지 않는다).
   - `oldStyleIds`(AS-yymmdd-NN 꼴)가 있으면 옛 화면에서 저장된 것 → `tools/dbfix.js`로 새 번호로 옮긴다(목록 출력의 version을 if_version으로).
3. 시트 읽기(값만, 파일로 저장됨): `get_spreadsheet` includeGridData, ranges `as!A1:P200`, `수거완료!A1:P400`, `출고예정!A1:P200`, `유상AS입금대기!A1:P300`, `보류!A1:P2070`, `처리완료!A1000:P1700`, fields `sheets.properties.title`, `sheets.properties.sheetId`, `sheets.properties.gridProperties`, `sheets.data.rowData.values.formattedValue`.
4. 계획: `tools/syncplan.sh plan <3의 파일> /home/user/as-data/dbNOW/cases` → 줄마다 `탭!P행`과 P값이 나온다.
5. 쓰기 직전 확인: 쓸 줄의 `C:F`를 `get_values`로 읽어 이름·제품이 계획과 같은지 본다. 다르면 3부터 다시.
6. 쓰기: `update_spreadsheet` 한 번에(전부 되거나 전부 안 됨).
   - P칸: `updateCells` start {sheetId, rowIndex: 행-1, columnIndex: 15}, stringValue = 계획의 P값, fields `userEnteredValue`
   - M·N: 같은 방식 columnIndex 12·13 (계획에 M=/N=이 있을 때만)
   - 옮김: `copyPaste` as 그 줄(A:P, endColumnIndex 16) → 수거완료 '옮김 행', PASTE_NORMAL → `deleteDimension` as 그 줄 → `appendDimension` as 1줄. 한 번에 여러 줄을 옮길 때는 **아래 줄부터** 지운다.
   - sheetId: as 111783976 · 수거완료 1856335090 · 출고예정 870760180 · 유상AS입금대기 691211646 · 보류 220357409 · 처리완료 841485114
7. 다시 읽기(3과 같음) → `tools/syncplan.sh check <새 파일> /home/user/as-data/dbNOW/cases` 가 전부 OK → `node tools/sync.js commit /home/user/as-data/sync/plan.json /home/user/as-data/sync/state.json`
8. 쓴 것이 있으면 원장에 한 줄(접수번호·줄 수만). 없으면 아무것도 남기지 않는다.

## 접수번호
번호는 `tools/ids.js`가 접수일·이름·제품으로 만든다(AS-yymmdd-XXXX). 시트 줄이 옮겨져도 바뀌지 않는다.
옛 번호(줄 순서로 매긴 AS-yymmdd-NN)는 날마다 바뀌어 다른 고객 건을 가리는 문제가 있어 11/25에 모두 새 번호로 옮겼다.
