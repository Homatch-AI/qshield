#!/bin/bash
set -e

# Usage: ./scripts/release.sh 1.2.0

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 1.2.0"
  exit 1
fi

echo "Releasing QShield Desktop v$VERSION"

# Update version in all packages
cd packages/qshield-desktop
npm version $VERSION --no-git-tag-version
cd ../qshield-core
npm version $VERSION --no-git-tag-version
cd ../..

# Update root package.json
npm version $VERSION --no-git-tag-version

# Commit and tag
git add -A
git commit -m "release: v$VERSION"
git tag -a "v$VERSION" -m "QShield Desktop v$VERSION"

echo ""
echo "Version bumped to v$VERSION"
echo ""
echo "To trigger the build, push the tag:"
echo "  git push origin main --tags"
echo ""
echo "GitHub Actions will build for macOS, Windows, and Linux."
echo "A draft release will be created at:"
echo "  https://github.com/Homatch-AI/qshield/releases"
