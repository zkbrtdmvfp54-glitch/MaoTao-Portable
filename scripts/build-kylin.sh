#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "麒麟 Linux packages must be built on Linux. Use npm run dist:kylin on Linux." >&2
  exit 2
fi

npm run dist:kylin
