#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS packages must be built on macOS. Use npm run dist:mac on a Mac." >&2
  exit 2
fi

has_signing_identity=0
if [[ -n "${CSC_LINK:-}" || -n "${CSC_NAME:-}" ]]; then
  has_signing_identity=1
elif command -v security >/dev/null 2>&1 && security find-identity -v -p codesigning 2>/dev/null | grep -Eq '[1-9][0-9]* valid identities found'; then
  has_signing_identity=1
fi

if [[ "$has_signing_identity" -eq 1 ]]; then
  npm run dist:mac -- --config.mac.hardenedRuntime=true
else
  npm run dist:mac -- --config.mac.hardenedRuntime=false
fi
