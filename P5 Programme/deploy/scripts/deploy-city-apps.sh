#!/usr/bin/env bash
# deploy-city-apps.sh — build + deploy the P5 apps as permanent Cloudflare Workers.
#
# UNIFIED ORIGIN (2026-09): the planner + pregame + city-builder share ONE origin
# (p5-city-sim) so localStorage hands the student's layout from the planner to
# the 3D city with no file download/upload round-trip:
#   City-sim: https://p5-city-sim.clover-marquis.workers.dev/
#     /city-builder/   the 3D AI City
#     /planner/        the 2D planner (was p5-planner)
#     /pregame/        City Planning Academy (was p5-pregame)
#   Old workers p5-planner / p5-pregame are REDIRECT STUBS to the unified paths.
#   Home / Fit Studio / Workshop remain separate workers.
#
# Usage:
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh   # build + deploy all
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh --city-sim  # only city-sim
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh --build-only --city-sim  # build only
#   CLOUDFLARE_ACCOUNT_ID=<account> ./deploy-city-apps.sh --deploy-only --city-sim # deploy tested bundle
#
# The account id for the Clover Marquis account (where the p3 education games
# live) is: a0775755ca3c2cf6f795f191bd6d792d
set -euo pipefail
cd "$(dirname "$0")/.."          # → deploy/
ROOT="$(cd .. && pwd)"           # → P5 Programme/
KIT="$ROOT/buddy-kit"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-}"

need_account() {
  if [ -z "$ACCOUNT" ]; then
    echo "ERROR: set CLOUDFLARE_ACCOUNT_ID (Clover Marquis = a0775755ca3c2cf6f795f191bd6d792d)" >&2
    exit 1
  fi
}

# ── Planner / pregame REDIRECT STUBS (old worker URLs → unified origin) ─────
# The real planner + pregame live under city-sim now. These keep old bookmarks /
# QR codes working until classrooms switch over. A meta-refresh + link both fire.
redirect_index() {
  local dir="$1" title="$2" url="$3"
  cat > "$dir/index.html" <<EOF
<!doctype html><meta charset="utf-8"><title>$title</title>
<meta http-equiv="refresh" content="0; url=$url">
<a href="$url">$title</a>
EOF
}

build_planner() {
  echo "▶ Building planner REDIRECT stub…"
  rm -rf planner/index.html planner/planner.js planner/styles.css planner/city-common planner/library planner/assets planner/crash-guard.js
  mkdir -p planner/assets
  redirect_index planner "My AI City — Planner" "https://p5-city-sim.clover-marquis.workers.dev/planner/"
  write_headers planner
  echo "  planner redirect stub ready."
}

build_pregame() {
  echo "▶ Building pregame REDIRECT stub…"
  rm -rf pregame/index.html pregame/app.js pregame/styles.css pregame/crash-guard.js
  redirect_index pregame "City Planning Academy" "https://p5-city-sim.clover-marquis.workers.dev/pregame/"
  write_headers pregame
  echo "  pregame redirect stub ready."
}

# ── Home (Champion Hub — pure static launcher for all scenario links) ───────
build_home() {
  echo "▶ Building home bundle…"
  rm -rf home/index.html home/home.css home/home.js home/links.js home/champion.js home/champion.glb home/champion-illustration.svg home/fonts home/fonts.css home/vendor
  cp "$KIT/client/home/index.html"                  home/index.html
  cp "$KIT/client/home/home.css"                    home/home.css
  cp "$KIT/client/home/home.js"                     home/home.js
  cp "$KIT/client/home/links.js"                    home/links.js
  cp "$KIT/client/home/champion.js"                 home/champion.js
  cp "$KIT/client/home/champion.glb"                home/champion.glb
  cp -r "$KIT/client/home/fonts"                    home/fonts
  cp "$KIT/client/home/fonts.css"                   home/fonts.css
  cp -r "$KIT/client/home/vendor"                   home/vendor
  cp "$KIT/client/crash-guard.js"                   home/crash-guard.js
  write_headers home
  echo "  home bundle ready."
}

# ── City-sim (static app + buddy kit under /buddy/ + /api/* worker) ────────
build_city_sim() {
  echo "▶ Building city-sim bundle…"
  rm -rf city-sim/city-builder city-sim/city-common city-sim/champion-city \
         city-sim/hong-kong-real city-sim/vendor city-sim/logic city-sim/buddy \
         city-sim/library city-sim/shared city-sim/planner city-sim/pregame \
         city-sim/studio city-sim/workshop \
         city-sim/hub \
         city-sim/project \
         city-sim/buddy-boot.js city-sim/buddy-core.css city-sim/buddy-theme.css \
         city-sim/buddy-widget.css city-sim/buddy-widget.js city-sim/buddy.js \
         city-sim/crash-guard.js
  cp -r "$KIT/client/city-builder"      city-sim/city-builder
  cp -r "$KIT/client/city-common"       city-sim/city-common
  cp -r "$KIT/client/champion-city"     city-sim/champion-city
  cp -r "$KIT/client/hong-kong-real"    city-sim/hong-kong-real
  cp -r "$KIT/client/vendor"            city-sim/vendor
  cp -r "$KIT/client/library"           city-sim/library
  cp -r "$KIT/client/shared"            city-sim/shared
  cp -r "$KIT/client/project-hub"        city-sim/hub
  # Studio is same-origin with City so its validated GLB + document revision can
  # be handed over atomically through IndexedDB. Workshop remains bridged while
  # its separately deployed editor is adopted.
  mkdir -p city-sim/studio city-sim/workshop
  rsync -a --exclude '.DS_Store' --exclude '*-t2-stamped.glb' \
    --exclude 'rover-leg-final-shrunk (1).glb' --exclude 'README.txt' \
    "$ROOT/Fit Studio/" city-sim/studio/
  cp "$KIT/client/project-shell/index.html" city-sim/workshop/index.html
  cp "$KIT/client/project-shell/shell.js" city-sim/workshop/shell.js
  cp -r "$KIT/logic"                    city-sim/logic
  cp "$KIT/client/crash-guard.js"       city-sim/crash-guard.js
  cp "$KIT/client/buddy-boot.js"        city-sim/buddy-boot.js
  cp "$KIT/client/buddy-core.css"       city-sim/buddy-core.css
  cp "$KIT/client/buddy-theme.css"      city-sim/buddy-theme.css
  cp "$KIT/client/buddy-widget.css"     city-sim/buddy-widget.css
  cp "$KIT/client/buddy-widget.js"      city-sim/buddy-widget.js
  cp "$KIT/client/buddy.js"             city-sim/buddy.js

  # ── Quest minigame `/project/p3-18-3d-city/` (quest id 4, "AI City Central"). Its relative
  # gameUrl in hong-kong-real/quests.js resolves same-origin to this path, so the app must ship in
  # the bundle or the iframe 404s in production (it only worked under the Node dev shell, which
  # mounts P5 Programme/project/). The app's absolute deps (/vendor/three, /champion-city/*,
  # /hong-kong-real/*) are already at the bundle root above.
  cp -r "$KIT/../project"              city-sim/project

  # ── UNIFIED ORIGIN: planner + pregame ride the SAME worker as the 3D city, so
  # localStorage hands the layout planner → city with no file round-trip.
  # planner.js imports city-common via '../city-common/...' which resolves to the
  # city-sim ROOT (copied above) — no duplicate copy, no library GLBs (the
  # planner renders emoji, never thumbnails/models).
  mkdir -p city-sim/planner city-sim/pregame
  cp "$KIT/client/city-planner/index.html"  city-sim/planner/index.html
  cp "$KIT/client/city-planner/planner.js"  city-sim/planner/planner.js
  cp "$KIT/client/city-planner/i18n.js"     city-sim/planner/i18n.js
  cp "$KIT/client/city-planner/styles.css"  city-sim/planner/styles.css
  cp "$KIT/client/city-pregame/index.html"  city-sim/pregame/index.html
  cp "$KIT/client/city-pregame/app.js"      city-sim/pregame/app.js
  cp "$KIT/client/city-pregame/i18n.js"     city-sim/pregame/i18n.js
  cp "$KIT/client/city-pregame/lesson-core.js" city-sim/pregame/lesson-core.js
  cp "$KIT/client/city-pregame/styles.css"  city-sim/pregame/styles.css
  # Root landing → the same-origin project dashboard. This replaces a launcher
  # that sent children straight into one tool with no project-resume context.
  printf '%s\n' '<!doctype html><meta charset="utf-8"><title>My AI City</title>' \
    '<meta http-equiv="refresh" content="0; url=./hub/">' \
    '<a href="./hub/">My Passiona Project</a>' > city-sim/index.html
  # Drop the .fbx animation SOURCES (never loaded at runtime; ~127M).
  rm -rf city-sim/champion-city/assets/animations

  # Buddy kit (worker gateway): ONE implementation — the canonical buddy-kit is
  # now Worker-compatible (server modules use default-import interop, not
  # createRequire; worker shell at worker/index.mjs; mem-seed generated from
  # server/memory). Exclude .env (secrets) and node_modules from the bundle.
  rm -rf city-sim/buddy
  mkdir -p city-sim/buddy city-sim/buddy/client
  rsync -a --exclude '.env' --exclude '.env.*' --exclude 'node_modules' \
    --exclude '.gitignore' --exclude '.DS_Store' --exclude 'package-lock.json' \
    "$KIT/server/" city-sim/buddy/server/
  cp -r "$KIT/logic"             city-sim/buddy/logic
  cp -r "$KIT/worker"            city-sim/buddy/worker
  cp "$KIT/bundle-package.json"  city-sim/buddy/package.json
  # /buddy/client fallback = just the widget files (the app folders already live
  # at the deploy root — the worker serves root-path misses from here).
  for w in buddy-boot.js buddy-core.css buddy-theme.css buddy-widget.css buddy-widget.js buddy.js; do
    cp "$KIT/client/$w"          city-sim/buddy/client/$w
  done
  echo "  installing worker deps…"
  ( cd city-sim/buddy && npm install --no-audit --no-fund >/dev/null 2>&1 )
  write_headers city-sim
  echo "  city-sim bundle ready."
}

# ── Caching — revalidate the code/config files every request so a deploy is
# never hidden by Cloudflare's edge cache or Chrome's disk cache (the "hard
# refresh doesn't help" problem). GLBs stay cacheable (large + rarely change).
write_headers() {
  local app="$1"
  cat > "$app/_headers" <<'EOF'
/*.html
  Cache-Control: no-cache
/*.js
  Cache-Control: no-cache
/*.mjs
  Cache-Control: no-cache
/*.json
  Cache-Control: no-cache
/*.png
  Cache-Control: no-cache
EOF
}

deploy_planner() {
  need_account
  echo "▶ Deploying planner → p5-planner …"
  ( cd planner/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

deploy_pregame() {
  need_account
  echo "▶ Deploying pregame → p5-pregame …"
  ( cd pregame/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

deploy_home() {
  need_account
  echo "▶ Deploying home → p5-home …"
  ( cd home/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

deploy_city_sim() {
  need_account
  echo "▶ Deploying city-sim → p5-city-sim …"
  ( cd city-sim/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

# ── Fit Studio (Champion Tune Studio + Animation Viewer — pure static) ───────
build_fit_studio() {
  echo "▶ Building fit-studio bundle…"
  mkdir -p fit-studio/cloudflare
  # Mirror the studio EXCEPT files that exceed Cloudflare's 25 MiB per-asset cap
  # (the "full"/t2-stamped gear variants, the stray "(1)" rover-leg duplicate) and
  # macOS junk. The manifest no longer references the excluded files. `cloudflare/`
  # is preserved so the wrangler config + worker survive every rebuild.
  rsync -a --delete \
    --exclude '.DS_Store' \
    --exclude '*-t2-stamped.glb' \
    --exclude 'rover-leg-final-shrunk (1).glb' \
    --exclude 'README.txt' \
    --exclude 'cloudflare/' \
    "$ROOT/Fit Studio/" fit-studio/
  echo "  fit-studio bundle ready."
}

deploy_fit_studio() {
  need_account
  echo "▶ Deploying fit-studio → p5-fit-studio …"
  ( cd fit-studio/cloudflare && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT" npx wrangler deploy )
}

# ── Library integrity gate ──────────────────────────────────────────────────
# Refuse to deploy if the shared model library is broken (missing glb / thumbnail
# for a catalogued entry, duplicate paths, or orphan count over the limit).
# Orphans are deliberate (kept for future cataloguing), so the default limit is
# generous; raise it via LIBRARY_ORPHAN_LIMIT when a CC0 sprint adds material.
run_audit() {
  echo "▶ Library audit…"
  local limit="${LIBRARY_ORPHAN_LIMIT:-25}"
  if ! node "$ROOT/scripts/library-audit.mjs" --orphan-limit "$limit"; then
    echo "ERROR: library audit failed — fix the library before deploying." >&2
    exit 1
  fi
  echo "  library audit OK."
}

# ── Minify step ──────────────────────────────────────────────────────────────
# esbuild TRANSFORM (not bundle): importmap + ESM untouched, each JS file
# minified in place on the deploy OUTPUT only. Fails soft — a broken minify
# must never block a deploy; the e2e gate catches a broken bundle.
minify_app() {
  local app="$1"
  echo "▶ Minifying $app static JS…"
  if ! node "$ROOT/scripts/minify-deploy.mjs" "$ROOT/deploy/$app" 2>&1 | tail -2; then
    echo "  WARNING: minify failed for $app — shipping unminified." >&2
  fi
}

# ── Import-graph gate ────────────────────────────────────────────────────────
# After a build, walk each app's entry module graph and fail if any referenced
# file is missing from the SOURCE tree or the freshly built bundle (catches the
# planner/i18n.js class of "referenced but not shipped" 404s before they go
# live). --deploy-dir scopes the check to one worker bundle (city-sim|home).
run_imports() {
  local deploy_dir="$1"
  echo "▶ Import-graph check ($deploy_dir)…"
  if ! node "$ROOT/scripts/check-imports.mjs" --deploy-dir "$deploy_dir"; then
    echo "ERROR: import graph references a missing file — fix before deploying." >&2
    exit 1
  fi
  echo "  import-graph OK."
}

# ── Deploy-or-skip helper (--build-only) ─────────────────────────────────────
deploy_if() {
  [ "$BUILD_ONLY" = "1" ] && { echo "  (build-only: skipping deploy)"; return 0; }
  case "$1" in
    planner) deploy_planner ;;
    pregame) deploy_pregame ;;
    home) deploy_home ;;
    city-sim) deploy_city_sim ;;
    fit-studio) deploy_fit_studio ;;
  esac
}

ONLY="all"
BUILD_ONLY=0
DEPLOY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --deploy-only) DEPLOY_ONLY=1 ;;
    --planner|--pregame|--home|--city-sim|--fit-studio|all) ONLY="$arg" ;;
  esac
done

if [ "$BUILD_ONLY" = "1" ] && [ "$DEPLOY_ONLY" = "1" ]; then
  echo "ERROR: --build-only and --deploy-only cannot be used together." >&2
  exit 2
fi

# Release verification runs the browser suite against deploy/city-sim, then
# uses this path to upload those exact bytes. Cloudflare retains the previous
# deployment as the immediate rollback target. Import checking is read-only and
# catches a missing/stale artifact without regenerating anything.
if [ "$DEPLOY_ONLY" = "1" ]; then
  case "$ONLY" in
    --city-sim) run_imports city-sim; deploy_city_sim ;;
    --home) run_imports home; deploy_home ;;
    *) echo "ERROR: --deploy-only requires --city-sim or --home." >&2; exit 2 ;;
  esac
  echo "✔ Tested artifact deployed without rebuilding."
  exit 0
fi

case "$ONLY" in
  --planner) run_audit; build_planner; minify_app planner; deploy_if planner ;;
  --pregame) run_audit; build_pregame; minify_app pregame; deploy_if pregame ;;
  --home) run_audit; build_home; minify_app home; run_imports home; deploy_if home ;;
  --city-sim) run_audit; build_city_sim; minify_app city-sim; run_imports city-sim; deploy_if city-sim ;;
  --fit-studio) run_audit; build_fit_studio; minify_app fit-studio; deploy_if fit-studio ;;
  *) run_audit; build_home; minify_app home; deploy_if home;
     build_planner; minify_app planner; deploy_if planner;
     build_pregame; minify_app pregame; deploy_if pregame;
     build_city_sim; minify_app city-sim; deploy_if city-sim;
     build_fit_studio; minify_app fit-studio; deploy_if fit-studio;
     run_imports city-sim; run_imports home ;;
esac
echo "✔ Done."
