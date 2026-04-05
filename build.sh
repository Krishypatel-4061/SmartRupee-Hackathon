#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# SmartRupee Hackathon — Unified Vercel Build Script
# Compiles all frontends into a single public_html/ directory
# ============================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$ROOT_DIR/public_html"

echo "🏗️  Starting SmartRupee unified build..."
echo "📁  Output directory: $OUT_DIR"

# ── Clean & create output directory ─────────────────────────
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# ── 1. Copy & rename the landing page as index.html ─────────
echo ""
echo "📄  Copying landing page → index.html"
cp "$ROOT_DIR/portal_landing.html" "$OUT_DIR/index.html"

# Copy QR demo cards
cp "$ROOT_DIR/qr-demo-cards.html" "$OUT_DIR/qr-demo-cards.html"

# ── 2. Copy frontend_organization (pure HTML/CSS/JS) ────────
echo ""
echo "🏢  Copying frontend_organization (static files)..."
mkdir -p "$OUT_DIR/frontend_organization"
cp -r "$ROOT_DIR/frontend_organization/"* "$OUT_DIR/frontend_organization/"

# ── 3. Build frontend_parent (Vite multi-page app) ──────────
echo ""
echo "👨‍👩‍👧  Building frontend_parent..."
cd "$ROOT_DIR/frontend_parent"
npm install --silent
npx vite build --base=/frontend_parent/
mkdir -p "$OUT_DIR/frontend_parent"
cp -r "$ROOT_DIR/frontend_parent/dist/"* "$OUT_DIR/frontend_parent/"

# ── 4. Build frontend-student (Vite + React app) ────────────
echo ""
echo "🎓  Building frontend-student..."
cd "$ROOT_DIR/frontend-student"
npm install --silent
npx vite build --base=/frontend-student/
mkdir -p "$OUT_DIR/frontend-student"
cp -r "$ROOT_DIR/frontend-student/dist/"* "$OUT_DIR/frontend-student/"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "✅  Build complete! public_html/ is ready for deployment."
echo ""
echo "Contents:"
ls -la "$OUT_DIR"
