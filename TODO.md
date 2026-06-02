# TODO

Cross-project backlog lives in `~/Documents/dev/backlog.md`; this file is science-agent-specific.

## Native-Node shared lib (unblock `prose-audit` everywhere)

Factor a shared Node library out of the commands — the move DeepMind made with `scienceskillscommon` in google-deepmind/science-skills.

**Why:** `prose-audit` is excluded from the Claude Code plugin and the skills.sh skill because its rule table lives in `muriel` (Python). Shipping it would force a Python install on every user. Port the `muriel.aiism` rule engine to native Node (the rule kinds are already partly reimplemented in `src/prose-audit.js`) so prose-audit runs with zero Python, then add it to the plugin command list and the `skills/science-agent/SKILL.md` command table.

**Scope:** native ports of the rule-kind engines; keep the licensed rule sources (proselint BSD-3-Clause; first-party AllSERP rules) and drop the CC-BY-SA-4.0 dependency path entirely. See CHANGELOG 0.4.0–0.6.0 for the licensing history.

## Skill-creator meta-skill (Phase 4 claim-audit + future expansion)

A meta-skill that scaffolds new science-agent skills/agents from a spec — the pattern behind `workflow_skill_creator` in google-deepmind/science-skills.

**Why:** the planned `claim-audit` agent (semantic "does the cited paper actually say this?", [PLAN.md Phase 4](PLAN.md)) and any future auditors all share the same shape: a `commands/*.md` + `agents/*.md` + `src/*.js` + a `skills/<name>/SKILL.md` entry. A generator keeps that boilerplate consistent and lowers the cost of adding the next auditor.

**Depends on:** the shared-lib item above (new skills should consume the common lib, not re-grow it).
