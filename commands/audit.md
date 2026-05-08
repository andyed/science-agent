---
description: Audit citations in a directory against a BibTeX file. Args: <dir> --bibtex=<path> [--json] [--verbose]
---

Run the science-agent citation audit with the user's arguments:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" audit $ARGUMENTS
```

Then summarize the result. Lead with orphan and ambiguous citations (the actionable signal). If `$ARGUMENTS` is empty, ask the user for a directory and a BibTeX path.
