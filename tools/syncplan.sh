#!/usr/bin/env bash
# 시트 쓰기 계획(또는 쓴 뒤 확인). 시트는 여기서 건드리지 않는다 — 읽어 온 파일로 계산만 한다.
# 사용: tools/syncplan.sh plan|check <get_spreadsheet 결과파일(A:Q, 처리완료는 A1000부터)> <db cases 폴더> [since]
set -euo pipefail
MODE=$1; G=$2; DB=${3:-}; SINCE=${4:-"2026-11-25 00:00"}; T=$(cd "$(dirname "$0")" && pwd); S=/home/user/as-data/sync; W=$S/tabs; mkdir -p "$W"
python3 -I - "$G" "$W" <<'P'
import json,sys
g,w=sys.argv[1:]; x=json.load(open(g)); x=x.get('content',x)
names={'as':'as','수거완료':'sugo','출고예정':'ship','유상AS입금대기':'pay','보류':'hold','처리완료':'done'}
info={}
for s in x['sheets']:
    t=s['properties']['title']
    rows=[[c.get('formattedValue','') for c in r.get('values',[])] for b in s.get('data',[]) for r in b.get('rowData',[])]
    json.dump({'values':rows},open(f"{w}/{names[t]}.json",'w'),ensure_ascii=False)
    gp=s['properties'].get('gridProperties',{})
    info[t]={'sheetId':s['properties'].get('sheetId'),'cols':gp.get('columnCount'),'rows':gp.get('rowCount'),'P1':(rows[0][15] if rows and len(rows[0])>15 else ''),'A1':(rows[0][0] if rows and rows[0] else ''),'P_used':sum(1 for r in rows[1:] if len(r)>15 and r[15]),'Q1':(rows[0][16] if rows and len(rows[0])>16 else ''),'Q_used':sum(1 for r in rows[1:] if len(r)>16 and r[16])}
json.dump(info,open(f"{w}/info.json",'w'),ensure_ascii=False)
print(json.dumps(info,ensure_ascii=False))
P
TABS=("as=$W/as.json" "수거완료=$W/sugo.json" "출고예정=$W/ship.json" "유상AS입금대기=$W/pay.json" "보류=$W/hold.json" "처리완료=$W/done.json:1000")
if [ "$MODE" = plan ]; then
  node "$T/sync.js" plan "$DB" "$S/state.json" "$SINCE" "${TABS[@]}" > "$S/plan.json"
  python3 -I - "$S/plan.json" "$S" <<'P'
import json,sys,collections
p=json.load(open(sys.argv[1])); S=sys.argv[2]
for i,e in enumerate(p['plan']):
    if e.get('nothing'): print(i,e['id'],'(쓸 것 없음 — 이미 반영됨)'); continue
    print(f"{i} {e['id']} [{e['by']}로 찾음] → {e['tab']}!P{e['row']}" + (f" · M={e.get('setM','-')} N={e.get('setN','-')}" if e.get('setN') or e.get('setM') else '') + (f" · 옮김→{e['move']} {e['moveTo']}행" if e.get('move') else ''))
    print('   P값:', json.dumps(e['p'],ensure_ascii=False))
for s in p['skipped']: print('건너뜀',s['id'],s['why'],f"({s['events']}건)")
for d in p['dupes']: print('중복 줄',d['id'],'쓰는 줄',d['keep'],'남은 줄',d['drop'])
for c in p.get('copied',[]): print(f"복사된 줄 {c['tab']} {c['row']}행: 번호 {c['was']} → {c['id']} (번호 붙이기에 포함)" + (f" · 딸려 온 메모 비움: {c['tab']}!P{c['row']} 를 빈 값으로" if c.get('clearP') else ' · 메모는 그대로 둠'))
# 번호 붙이기: 탭마다 update_values 한 번 (null은 건너뜀). 값은 파일로 남긴다.
by=collections.defaultdict(list)
for q in p['qfill']: by[q['tab']].append(q)
out={}
for t,l in by.items():
    a,b=l[0]['row'],l[-1]['row']; m={q['row']:q['id'] for q in l}
    out[t]={'range':f"{t}!Q{a}:Q{b}",'values':[[m.get(r)] for r in range(a,b+1)],'count':len(l)}
    print(f"번호 붙이기 {t}: {out[t]['range']} ({len(l)}줄)")
json.dump(out,open(S+'/qfill.json','w'),ensure_ascii=False)
json.dump(p['status'],open(S+'/status.json','w'),ensure_ascii=False)
print('쓸 줄',sum(1 for e in p['plan'] if not e.get('nothing')),'· 번호 붙일 줄',len(p['qfill']),'· 건너뜀',len(p['skipped']),'· 중복',len(p['dupes']))
P
elif [ "$MODE" = check ]; then
  node "$T/sync.js" check "$S/plan.json" "${TABS[@]}"
fi
