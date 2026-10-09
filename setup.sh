#!/usr/bin/env bash
# 一键部署脚本：跑完后浏览器点一次「授权」即可完成全部配置
set -euo pipefail

PROJECT="marksix-research"
KV_NAME="MARKSIX_DATA"

echo "==> [1/6] 检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装： https://nodejs.org/en/download"
  exit 1
fi
node -v

echo "==> [2/6] 安装 Wrangler CLI"
npm install wrangler --save-dev --silent 2>&1 | tail -3

echo "==> [3/6] 登录 Cloudflare（浏览器会弹出，点一次「Allow」即可）"
npx wrangler login

echo "==> [4/6] 创建 KV 命名空间（生产环境）"
PROD_OUT=$(npx wrangler kv namespace create "$KV_NAME" 2>&1)
echo "$PROD_OUT"
PROD_ID=$(echo "$PROD_OUT" | grep -oE "id = '[0-9a-f]{32}'" | head -1 | grep -oE "[0-9a-f]{32}")
if [[ -z "$PROD_ID" ]]; then
  echo "未解析到生产 Namespace ID，请手动复制上面 id = 后面的值"
  read -rp "粘贴生产 Namespace ID: " PROD_ID
fi

echo "==> [5/6] 创建 KV 命名空间（预览环境）"
PREV_OUT=$(npx wrangler kv namespace create "$KV_NAME" --preview 2>&1)
echo "$PREV_OUT"
PREV_ID=$(echo "$PREV_OUT" | grep -oE "preview_id = '[0-9a-f]{32}'" | head -1 | grep -oE "[0-9a-f]{32}")
if [[ -z "$PREV_ID" ]]; then
  PREV_ID=$(echo "$PREV_OUT" | grep -oE "id = '[0-9a-f]{32}'" | head -1 | grep -oE "[0-9a-f]{32}")
fi
if [[ -z "$PREV_ID" ]]; then
  read -rp "粘贴预览 Namespace ID: " PREV_ID
fi

echo "==> [6/7] 写入 wrangler.toml 并部署"
cat > wrangler.toml <<EOF
name = "$PROJECT"
main = "src/index.js"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "$KV_NAME"
id = "$PROD_ID"
preview_id = "$PREV_ID"

[observability]
enabled = true
EOF

echo "--- wrangler.toml ---"
cat wrangler.toml

npx wrangler deploy

echo "==> [7/7] 导入历史开奖记录（seed/history.json，共 $(python3 -c "import json;print(len(json.load(open('seed/history.json'))))" 2>/dev/null || echo '?') 期）"
npx wrangler kv key put history --path=seed/history.json --namespace-id="$PROD_ID"

echo ""
echo "部署完成。生产 Namespace ID: $PROD_ID"
echo "记下上面输出的 *.workers.dev 地址，那是你的 API 根地址。"
echo "验证历史数据是否已导入：curl https://<你的地址>/api/history"
