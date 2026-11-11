---
description: Fuzzy-search CrossRef by title. Args: "title query"
---

Run a CrossRef title search:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli.js" search $ARGUMENTS
```

Show the top matches with DOIs. The user is usually trying to recover a real citation from a half-remembered title — pick the best match and offer to verify it.
