---
description: Audit citations and verify BibTeX DOI metadata against Crossref. Args: <dir> --bibtex=<path> [--offline] [--json] [--verbose]
---

Run the science-agent citation audit with the user's arguments:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli.js" audit $ARGUMENTS
```

Then summarize the result. Lead with wrong DOI, title, author, and year
mismatches, followed by orphan and ambiguous citations. `--offline` must be
described as a local linkage check, not a metadata verification. If
`$ARGUMENTS` is empty, ask the user for a directory and a BibTeX path.
