#!/usr/bin/env bash
# 매일 갱신: 시트 수집본 파일 → 업무판 HTML. 사용: tools/daily.sh <작업폴더> <기준시각 'YYYY-MM-DD HH:MM'> <get_spreadsheet 결과파일> <현대 탭 get_values 결과파일>
set -euo pipefail
D=$1; AT=$2; G=$3; H=$4; T=$(cd "$(dirname "$0")" && pwd)
python3 -I - "$G" "$H" "$D" <<'P'
import json,sys
g,h,d=sys.argv[1:]
x=json.load(open(g)); x=x.get('content',x)
names={'as':'as','수거완료':'sugo','출고예정':'ship','유상AS입금대기':'pay','보류':'hold','처리완료':'done'}
for s in x['sheets']:
    rows=[[c.get('formattedValue','') for c in r.get('values',[])] for b in s.get('data',[]) for r in b.get('rowData',[])]
    json.dump({'values':rows},open(f"{d}/{names[s['properties']['title']]}.json",'w'),ensure_ascii=False)
v=json.load(open(h))['values']
json.dump({'values':v},open(f'{d}/hs_a.json','w'),ensure_ascii=False)
json.dump({'values':[r[41:46] if len(r)>41 else [] for r in v]},open(f'{d}/hs_b.json','w'),ensure_ascii=False)
P
node "$T/hs.js" "$D/hs_a.json" "$D/hs_b.json" "$AT" > "$D/hs-cases.json" 2>"$D/hs.log"
node "$T/hspartner.js" "$D/tower/tower/as_hyundai.json" "$D/hs-cases.json" > "$D/hsp-cases.json" 2>"$D/hsp.log"
node "$T/cafe24.js" "$D/cafe24.json" > "$D/cafe24-cases.json" 2>"$D/c24.log"
node "$T/snapshot.js" /home/user/juvera-as-board.html /home/user/as-board-snapshot.html "$AT" \
  "as=$D/as.json" "수거완료=$D/sugo.json" "출고예정=$D/ship.json" "유상AS입금대기=$D/pay.json" "보류=$D/hold.json" "처리완료=$D/done.json" \
  "hs=$D/hs-cases.json" "hs=$D/hsp-cases.json" "hs=$D/cafe24-cases.json" ${REPORTS:+"reports=$REPORTS"}
cat "$D/hsp.log" "$D/c24.log"
