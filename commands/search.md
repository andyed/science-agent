---
description: Fuzzy-search CrossRef by title. Args: "title query"
---

Run a CrossRef title search:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" search $ARGUMENTS
```

Show the top matches with DOIs. The user is usually trying to recover a real citation from a half-remembered title — pick the best match and offer to verify it.
