# September functional blocks — 24 September 2026

Scope: authorized blocks 1–5, plus collaborator autocomplete requested during implementation.

- Avatars: authenticated backend Geocoding v4; preserves full slash house number. Readiness accepts a rendered target without requiring animation-end. Export checks 2,000,000-byte limit with JPEG fallback. Actual Google/WebGL end-to-end verification remains separate from synthetic capture tests.
- Expenses: account-bound combined criteria, optional booked-date validity, assign suggestion, exact invoice-number/VS match, explicit automatic COMMITTED cost creation, reversible ignore. Ambiguous rules leave a movement untouched. Current creator and operator permissions checked when applying; same physical account required across houses. Serializable ledger application with audit, no changes to ACTUAL recognition or rent/deposit allocation logic.
- CSV: mandatory preview with state fingerprint; exact IDs skip, conflicting IDs block, possible cross-source and within-file duplicates default to skip. User may explicitly include a suspect row. This is not universal fuzzy dedup and not an arbitrary Excel/bank-format adapter. Existing semicolon CSV template remains supported.
- Users: personal created/managed/owner/explicit access overview; creator inferred only from earliest PROPERTY_CREATED audit. Global access not counted as ownership. Global users omitted from building member list. Scoped autocomplete selects ID and resolves canonical email server-side; no automatic merge by similar name or alternate email.
- Announcements and templates: editable text, optimistic revision check and atomic before/after audit. Dismissal preserved unless explicitly reset; no email sent. Existing tasks unchanged. Four additional non-runnable task candidates displayed, existing unmatched/cost-due candidates retained disabled.

Financial changes are sensitive: automatic CREATE_COST is explicit, produces COMMITTED only, and must be checked in isolated regression tests. No production release in this block.

## Deferred visual polish
- Native upload buttons across avatar/document forms.
- Inconsistent heading/form container widths, including New task screenshot efb45538-2655-42be-91e0-954fbcabcf0d.png.
- New task context/category vertical alignment and dark-mode legend contrast.
- Remove widen/narrow-content toggle; establish automatic responsive widths by screen purpose.
- Full screen audit to include further user findings; no blanket claim of visual completion.

## Validation
- TypeScript and pure rule/geocoding policy checks passed before CI.
- Prisma validate, PostgreSQL 18 migration, production build and all static gates passed in CI.
- Initial CI 35978895184: 199 browser tests passed. Final-review head 75c9435: 198 passed; one test locator was ambiguous after nested processing history was added. Selector narrowed to the movement’s direct summary, preserving all assertions; corrected-head CI pending.
- New expense-rule and user-relationship screenshots inspected. Shared page/shell positioning still needs the explicitly deferred visual polish; this is not a claim of visual completion.
- Actual authenticated Google/WebGL verification remains open; private tool is unavailable in the current unauthenticated browser. Sandbox acceptance can proceed, production readiness is not asserted.
