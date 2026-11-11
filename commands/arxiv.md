---
description: Audit recent arXiv papers for citation quality. Args: [count] [--cat=cs.AI]
---

Run the arXiv audit:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli.js" arxiv $ARGUMENTS
```

This is a spot-check on the literature — show citation health stats (orphans, ambiguous, DOI coverage) per paper. Flag any paper that looks suspiciously bad.
