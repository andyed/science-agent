---
description: Search arXiv by free text; surfaces published DOIs ready to verify. Args: "query" [--max=10] [--sort=relevance] [--id=2401.12345]
---

Run the arXiv search:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" arxiv-search $ARGUMENTS
```

This is the *find* step that pairs with science-agent's *verify* step. It queries the public arXiv API and returns structured metadata — including `arxiv:doi` and `arxiv:journal_ref` when a preprint has been published. When a result shows a published DOI, chain `/science-agent:verify <doi>` to confirm it against CrossRef.

Use `--id=2401.12345` to look up specific arXiv IDs instead of a text query.
