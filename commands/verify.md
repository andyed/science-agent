---
description: Verify a single DOI against CrossRef. Args: <doi>
---

Run DOI verification:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" verify $ARGUMENTS
```

Report the canonical title, authors, and venue. Flag if CrossRef has no record (likely fabricated) or if the metadata diverges from what the user expected.
