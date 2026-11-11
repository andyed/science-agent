---
description: Check that producers reproduce a shipped number before reporting a new one. Args: <dir-or-sidecar> [--require-gate] [--verbose] [--json]
---

Run repro-audit with the user's arguments:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" repro-audit $ARGUMENTS
```

Lead with the gates that exist and are broken — `gate_failed` and `stale_pin` — not
with the ungated count. An output tree is mostly descriptive dumps that have no
shipped number to reproduce; `ungated` is a warning for that reason, and only
becomes the headline under `--require-gate`.

A run that scanned zero sidecars exits 2. Report that as "nothing was checked",
never as a clean result.
