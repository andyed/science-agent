---
description: Verify figure caption numerics against summary.json sidecars. Args: <INDEX.md> [--json]
---

Run figure-audit with the user's arguments:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" figure-audit $ARGUMENTS
```

Lead with mismatches (the primary stale-prose signal). Unverified is informational. Don't edit the JSON sidecar — only the markdown caption is editable.
