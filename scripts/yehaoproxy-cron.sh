#!/usr/bin/env bash
set -euo pipefail

# 宝塔计划任务可直接执行本文件。
# 在宝塔任务脚本顶部设置 DOMAIN 和 CRON_SECRET，或作为环境变量传入。
DOMAIN="${DOMAIN:?请设置站点域名，例如 https://proxy.example.com}"
CRON_SECRET="${CRON_SECRET:?请设置与服务器一致的 CRON_SECRET}"

curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${DOMAIN%/}/api/cron/reminders"
