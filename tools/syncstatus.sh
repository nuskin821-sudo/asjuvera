#!/usr/bin/env bash
# 업무판에 보여 줄 '시트 반영 상태' 문서를 만든다 → ArtifactData set (collection cases, doc_id _sync, file_path 이 파일)
# 사용: tools/syncstatus.sh <이번에 쓴 줄 수>   (plan을 돌린 뒤에)
set -euo pipefail
S=/home/user/as-data/sync
python3 -I - "$S/status.json" "$S/_sync.json" "${1:-0}" "$(TZ=Asia/Seoul date '+%-m/%-d %H:%M')" <<'P'
import json,sys
st=json.load(open(sys.argv[1])); n=int(sys.argv[3])
body={'at':sys.argv[4],'wrote':n,'skipped':st.get('skipped',[]),'dupes':st.get('dupes',[])}
json.dump({'sync':json.dumps(body,ensure_ascii=False),'at':sys.argv[4],'by':'AS'},open(sys.argv[2],'w'),ensure_ascii=False)
print(json.dumps(body,ensure_ascii=False))
P
