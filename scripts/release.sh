#!/usr/bin/env bash
set -euo pipefail

if [ "$(git branch --show-current)" != "main" ]; then
  echo "error: run releases from the main branch" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree is not clean; commit or stash your changes first" >&2
  exit 1
fi

BEFORE_TAG=$(git tag --sort=-version:refname | head -1)

semantic-release

NEW_TAG=$(git tag --sort=-version:refname | head -1)
if [ "$NEW_TAG" != "$BEFORE_TAG" ]; then
  echo "Pushed $NEW_TAG — the Release workflow is now building and publishing it."
else
  echo "No new release (nothing to publish)."
fi
