# repro fixtures

Assertions for `tools/repro-eval.js`, two-sided like the prose and notebook
corpora: `must_fire` proves the auditor still catches a defect, `must_not_fire`
proves it has not become permissive enough to wave a broken gate through.

The floors (`min_producers`, `min_checks`) are the third axis, and the reason
this file exists. This auditor's plausible failure mode is not a wrong verdict —
it is reading zero sidecars, finding zero defects, and reporting a clean run,
which looks exactly like a fully gated repo. Something has to assert it can
still see.

| dir | what it is |
| --- | --- |
| `shipped/` | the upstream sidecars the gates pin to; `moved_summary.json` is the same number after it moved |
| `gated-ok/` | a producer that reproduced its shipped number, with a resolvable and current pin |
| `ungated/` | a producer reporting new numbers with no gate at all |
| `gate-failed/` | a gate whose delta exceeds its own declared tolerance while still claiming `status: ok` |
| `stale-pin/` | a passing gate pinned to a literal the cited source no longer carries |
| `skipped/` | one undocumented skip, one skip with a stated reason |
| `uncited/` | a passing gate whose pin is a bare literal, so staleness is uncheckable |
| `empty/` | no sidecars — must produce a nonzero exit, never a clean run |
