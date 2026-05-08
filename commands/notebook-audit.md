---
description: Verify [NB##:K##] claim references in prose against notebook sources. Args: <dir> [--aggregate=<path>] [--notebooks=<dir>] [--cross-repo=<dir>]
---

Run notebook-audit with the user's arguments:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" notebook-audit $ARGUMENTS
```

Surface unresolved claim references and stale numerics. If the project hasn't set up Key Claims conventions, the tool degrades gracefully and explains what to do — pass that explanation through.
