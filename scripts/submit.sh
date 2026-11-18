#!/bin/bash

set -euo pipefail
cd "$(dirname "$0")/.."
bun run submit "$@"
