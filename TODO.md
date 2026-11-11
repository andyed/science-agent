# TODO

Cross-project backlog lives in `~/Documents/dev/backlog.md`; this file is science-agent-specific.

## Native-Node shared lib

Factor a shared Node library out of the commands — the move DeepMind made with `scienceskillscommon` in google-deepmind/science-skills.

**Why:** each auditor re-grows the same pieces: directory walk, `summary.json` reading (including Python's `NaN`/`Infinity` dialect, which only `repro-audit` handles), severity counting, report formatting, and the zero-parse guard. `figure-audit` and `repro-audit` both read sidecars and do not share a reader.

**Done already:** the original motivation — porting the `muriel.aiism` rule engine so `prose-audit` runs without Python — shipped; `prose-audit` is in the plugin and muriel is an optional pass. See CHANGELOG 0.4.0–0.7.0 for the licensing history.

## Exit-code consistency

`figure-audit`, `repro-audit`, `prose-audit` and `notebook-audit` exit 2 when nothing was checked; `audit` and `aggregate` exit 1 for a missing path. Move those two to 2 in a release that can call it out as a breaking change for CI scripts.

## Skill-creator meta-skill (Phase 4 claim-audit + future expansion)

A meta-skill that scaffolds new science-agent skills/agents from a spec — the pattern behind `workflow_skill_creator` in google-deepmind/science-skills.

**Why:** the planned `claim-audit` agent (semantic "does the cited paper actually say this?", [PLAN.md Phase 4](PLAN.md)) and any future auditors all share the same shape: a `commands/*.md` + `agents/*.md` + `src/*.js` + a `skills/<name>/SKILL.md` entry. A generator keeps that boilerplate consistent and lowers the cost of adding the next auditor.

**Depends on:** the shared-lib item above (new skills should consume the common lib, not re-grow it).
