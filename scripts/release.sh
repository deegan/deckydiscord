#!/bin/bash
# Bump the version, build, commit, tag and push. CI builds the release zip.
# Usage: ./scripts/release.sh 0.4.1
set -euo pipefail

[[ -f package.json && -f plugin.json ]] || { echo "run from the project root" >&2; exit 1; }
VERSION=${1:?usage: $0 x.y.z}
[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must be x.y.z" >&2; exit 1; }
TAG="v$VERSION"
git rev-parse "$TAG" >/dev/null 2>&1 && { echo "tag $TAG already exists" >&2; exit 1; }

jq ".version = \"$VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
jq ".version = \"$VERSION\"" plugin.json > plugin.json.tmp && mv plugin.json.tmp plugin.json

npx -y pnpm@9 install --frozen-lockfile
npx -y pnpm@9 run typecheck
npx -y pnpm@9 run build
python3 -m py_compile main.py py_modules/*.py

git add package.json plugin.json
git commit -m "Release $TAG"
git tag -a "$TAG" -m "Deckycord $TAG"

read -p "Push main and $TAG to origin? (y/N) " -n 1 -r; echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin HEAD "$TAG"
    echo "Pushed. GitHub Actions will attach Deckycord-$TAG.zip to the release."
fi
