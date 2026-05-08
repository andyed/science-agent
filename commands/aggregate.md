---
description: Generate a key-claims summary from notebooks with `## Key Claims` sections. Args: <notebooks-dir> [-o <path>]
---

Run the key-claims aggregator:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" aggregate $ARGUMENTS
```

If the user didn't pass `-o`, the result prints to stdout — show it and offer to write it to `notebook-key-claims.md`.
