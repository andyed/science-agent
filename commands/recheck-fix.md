---
summary: "Invoke the agent review of a proposed scientific correction."
read_when:
  - "Invoking the recheck-fix slash command"
description: Check a replacement sentence against its cited primary evidence before closing the finding.
argument-hint: <replacement sentence or file location> <source citation or URL if needed>
---

Review the following correction using the instructions in `${CLAUDE_PLUGIN_ROOT}/skills/science-agent/references/recheck-fix.md`. Read that file and apply its verdict criteria to the supplied wording.

$ARGUMENTS
