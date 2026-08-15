#!/usr/bin/env bash
# deploy-city-apps.sh — build + deploy the P5 2D planner and 3D city sim as two
# permanent Cloudflare Workers (one per app).
#
#   Planner : https://p5-planner.clover-marquis.workers.dev/   (static only)
#   City-sim: https://p5-city-sim.clover-marquis.workers.dev/  (static + /api/* buddy gateway)
#
# Usage:
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh   # build + deploy both
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh --planner   # only planner
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh --city-sim  # only city-sim
#
# The account id for the Clover Marquis account (where the p3 education games
# live) is: a0775755ca3c2cf6f795f191bd6d792d
set -euo pipefail
cd "$(dirname "$0")/.."          # → deploy/
ROOT="$(cd .. && pwd)"           # → P5 Programme/
KIT="$ROOT/buddy-kit"
P501="$ROOT/_p5-reference/P5 Project /p5-01-recycle-eye"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-}"

need_account() {
  if [ -z "$ACCOUNT" ]; then
    echo "ERROR: set CLOUDFLARE_ACCOUNT_ID (Clover Marquis = a0775755ca3c2cf6f795f191bd6d792d)" >&2
    exit 1
  fi
}

# ── Planner (pure static — the Optimize button is a local hill-climb) ──────
build_planner() {
  echo "▶ Building planner bundle…"
  rm -rf planner/index.html planner/planner.js planner/styles.css planner/city-common planner/assets
  mkdir -p planner/assets
  cp "$KIT/client/city-planner/index.html"  planner/index.html
  cp "$KIT/client/city-planner/planner.js"  planner/planner.js
  cp "$KIT/client/city-planner/styles.css"  planner/styles.css
  cp -r "$KIT/client/city-common"           planner/city-common
  rm -f planner/city-common/package.json    # node-test shim only; not needed in browser
  echo "  planner bundle ready."
}

# ── City-sim (static app + buddy kit under /buddy/ + /api/* worker) ────────
build_city_sim() {
  echo "▶ Building city-sim bundle…"
  rm -rf city-sim/city-builder city-sim/city-common city-sim/champion-city \
         city-sim/hong-kong-real city-sim/vendor city-sim/logic city-sim/buddy \
         city-sim/buddy-boot.js city-sim/buddy-core.css city-sim/buddy-theme.css \
         city-sim/buddy-widget.css city-sim/buddy-widget.js city-sim/buddy.js
  cp -r "$KIT/client/city-builder"      city-sim/city-builder
  cp -r "$KIT/client/city-common"       city-sim/city-common
  cp -r "$KIT/client/champion-city"     city-sim/champion-city
  cp -r "$KIT/client/hong-kong-real"    city-sim/hong-kong-real
  cp -r "$KIT/client/vendor"            city-sim/vendor
  cp -r "$KIT/logic"                    city-sim/logic
  cp "$KIT/client/buddy-boot.js"        city-sim/buddy-boot.js
  cp "$KIT/client/buddy-core.css"       city-sim/buddy-core.css
  cp "$KIT/client/buddy-theme.css"      city-sim/buddy-theme.css
  cp "$KIT/client/buddy-widget.css"     city-sim/buddy-widget.css
  cp "$KIT/client/buddy-widget.js"      city-sim/buddy-widget.js
  cp "$KIT/client/buddy.js"             city-sim/buddy.js
  # Drop the .fbx animation SOURCES (never loaded at runtime; ~127M).
  rm -rf city-sim/champion-city/assets/animations

  # Buddy kit (worker gateway): use the p5-01 MATCHED server+logic+worker pair,
  # which is Worker-compatible (the newer buddy-kit server uses createRequire /
  # node:fs and fails on Workers). The client widget stays the buddy-kit's.
  mkdir -p city-sim/buddy
  cp -r "$P501/buddy/server"            city-sim/buddy/server
  cp -r "$P501/buddy/logic"             city-sim/buddy/logic
  cp -r "$P501/buddy/worker"            city-sim/buddy/worker
  cp "$P501/buddy/package.json"         city-sim/buddy/package.json
  # Trim the /buddy/client fallback to just the widget files (the app folders
  # already live at the deploy root).
  cp -r "$P501/buddy/client"            city-sim/buddy/client
  rm -rf city-sim/buddy/client/examples city-sim/buddy/client/i18n
  echo "  installing worker deps…"
  ( cd city-sim/buddy && npm install --no-audit --no-fund >/dev/null 2>&1 )
  echo "  city-sim bundle ready."
}

deploy_planner() {
  need_account
  echo "▶ Deploying planner → p5-planner …"
  ( cd planner/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

deploy_city_sim() {
  need_account
  echo "▶ Deploying city-sim → p5-city-sim …"
  ( cd city-sim/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

ONLY="${1:-all}"
case "$ONLY" in
  --planner) build_planner; deploy_planner ;;
  --city-sim) build_city_sim; deploy_city_sim ;;
  *) build_planner; deploy_planner; build_city_sim; deploy_city_sim ;;
esac
echo "✔ Done."
