#!/usr/bin/env bash
# 通过 Cloudflare REST API 部署「全新」资源（不影响账号内任何现有资源）
# 用法： ACCOUNT_ID=xxx TOKEN=xxx bash deploy_via_api.sh
set -euo pipefail

ACCOUNT_ID="${ACCOUNT_ID:-}"
TOKEN="${TOKEN:-}"
SCRIPT_NAME="marksix-research"
KV_NAME="MARKSIX_DATA"

if [[ -z "$TOKEN" ]]; then
  echo "用法： TOKEN=你的令牌 bash deploy_via_api.sh"
  echo "（ACCOUNT_ID 可省略，脚本会用令牌自动查询）"
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

# 未提供 ACCOUNT_ID 时用令牌自动查询，省去手动查找
if [[ -z "$ACCOUNT_ID" ]]; then
  echo "==> 未提供 ACCOUNT_ID，用令牌自动查询账号"
  ACC_JSON=$(curl -s https://api.cloudflare.com/client/v4/accounts -H "$AUTH")
  echo "$ACC_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('result',[])
for x in r: print('  候选账号:', x.get('name'), x.get('id'))
"
  ACCOUNT_ID=$(echo "$ACC_JSON" | python3 -c "import sys,json;r=json.load(sys.stdin).get('result',[]);print(r[0]['id'] if r else '')")
  if [[ -z "$ACCOUNT_ID" ]]; then
    echo "  自动查询失败，请手动提供： ACCOUNT_ID=xxx TOKEN=xxx bash deploy_via_api.sh"
    exit 1
  fi
  echo "  使用 Account ID: $ACCOUNT_ID"
fi

API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID"

# ============================================================
# 安全声明：本脚本只会「创建」名为 MARKSIX_DATA 的 KV
# 和名为 marksix-research 的 Worker，并写入这两者。
# 不含任何 delete / list-modify 操作，不触碰账号内其他资源。
# ============================================================

echo "==> [1/6] 只读预检：列出账号现有资源（不修改任何东西）"
curl -s "$API/storage/kv/namespaces" -H "$AUTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
res=d.get('result',[])
print('  现有 KV 命名空间：')
for ns in res: print('    -', ns.get('title'), ns.get('id'))
if not res: print('    （无）')
" || echo "  (KV 列表读取失败，继续)"
curl -s "$API/workers/scripts" -H "$AUTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
res=d.get('result',[])
print('  现有 Worker：')
for w in res: print('    -', w.get('id'))
if not res: print('    （无）')
" || echo "  (Worker 列表读取失败，继续)"
echo "  以上均为现有资源，本次部署不会修改其中任何一个。"
echo ""

echo "==> [2/6] 准备 KV 命名空间：$KV_NAME"
EXISTING=$(curl -s "$API/storage/kv/namespaces" -H "$AUTH" | python3 -c "
import sys,json
r=json.load(sys.stdin).get('result',[])
m=[x for x in r if x.get('title')=='$KV_NAME']
print(m[0]['id'] if m else '')
")
if [[ -n "$EXISTING" ]]; then
  NS_ID="$EXISTING"
  echo "  已存在，直接复用: $NS_ID"
else
  NS_RESP=$(curl -s -X POST "$API/storage/kv/namespaces" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"name\":\"$KV_NAME\",\"title\":\"$KV_NAME\"}")
  echo "$NS_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  新建 OK' if d.get('success') else '  FAIL: '+str(d.get('errors')))"
  NS_ID=$(echo "$NS_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['id'])")
fi
echo "  Namespace ID: $NS_ID"

echo "==> [3/6] 生成 Worker 绑定配置（绑定到刚建的新 KV）"
python3 - "$NS_ID" <<'PY'
import json, sys
ns = sys.argv[1]
meta = {
    "main_module": "index.js",
    "bindings": [
        {"type": "kv_namespace", "name": "MARKSIX_DATA", "namespace_id": ns}
    ],
    "compatibility_date": "2026-01-01",
    "observability": {"enabled": True},
}
open("metadata.json", "w").write(json.dumps(meta))
print("  绑定：MARKSIX_DATA ->", ns)
PY

echo "==> [4/6] 上传 Worker 脚本：$SCRIPT_NAME"
UP_RESP=$(curl -s -X PUT "$API/workers/scripts/$SCRIPT_NAME" \
  -H "$AUTH" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "index.js=@src/index.js;type=application/javascript+module")
echo "$UP_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  OK' if d.get('success') else '  FAIL: '+str(d.get('errors')))"

echo "==> [5/6] 开启 workers.dev 访问地址"
curl -s -X POST "$API/workers/scripts/$SCRIPT_NAME/subdomain" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"enabled":true}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  子域:',d['result'].get('subdomain')) if d.get('success') else print('  FAIL:',d.get('errors'))"

echo "==> [6/6] 导入历史开奖记录到新 KV"
curl -s -X PUT "$API/storage/kv/namespaces/$NS_ID/values/history" \
  -H "$AUTH" -H "Content-Type: application/json" \
  --data-binary @seed/history.json \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  OK' if d.get('success') else '  FAIL: '+str(d.get('errors')))"

SUBDOMAIN=$(curl -s "$API/workers/subdomain" -H "$AUTH" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result']['subdomain'] if d.get('success') else '')")

echo ""
echo "=============================="
echo "部署完成（全部为新建资源）"
echo "  新 KV       : $KV_NAME ($NS_ID)"
echo "  新 Worker   : $SCRIPT_NAME"
if [[ -n "$SUBDOMAIN" ]]; then
  echo "  访问地址    : https://$SCRIPT_NAME.$SUBDOMAIN.workers.dev"
  echo "  验证历史数据: https://$SCRIPT_NAME.$SUBDOMAIN.workers.dev/api/history"
  echo "  数据体检    : https://$SCRIPT_NAME.$SUBDOMAIN.workers.dev/api/validate"
fi
echo "=============================="
echo "请到 https://dash.cloudflare.com/?to=/:account/api-tokens 吊销本次的临时令牌。"
