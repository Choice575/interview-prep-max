#!/usr/bin/env bash
set -euo pipefail
# This is a forced command for a dedicated key. No interactive shell, forwarding,
# caller-supplied environment, paths or arbitrary shell arguments are accepted.
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec /bin/bash /home/ipmax/bin/deploy-production.sh "${BASH_REMATCH[1]}"
fi
echo 'Only deploy <full-commit-sha> is permitted' >&2
exit 2
