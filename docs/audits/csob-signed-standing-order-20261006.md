# ČSOB signed standing-order amount — 2026-10-06

## Observed defect and scope

A live ČSOB notification says `Trvalý příkaz elektronicky 5` and has an explicit negative amount in its `Částka` field. The production parser removes the minus as a label separator and then treats the amount as incoming. Reprocessing reproduces the error. No rent allocation was performed during verification.

The fix preserves the sign for monetary fields and generic amount extraction. Only a labeled negative amount in a ČSOB notification supplies the additional debit-direction signal. Known own account, trusted sender, authentication checks and conflicting-direction rejection remain mandatory for automatic processing. Financial allocation rules and user permissions are unchanged. No migration.

## Regression evidence

Synthetic data covers line-separated and blank-line text, colon labels, HTML, replay from the redacted excerpt, trusted and forged senders, failed DMARC, absent own account, conflicting incoming wording, unlabeled negative amounts and balance-only text. Existing incoming/outgoing cases remain covered.

Local `verify-csob-parser.ts` and `verify-bank-balance-redaction.ts` passed. Payments1 static checks passed; its runtime phase requires the isolated CI database and was not claimed as locally verified. Full CI (including isolated migrations, production build and browser smoke) is required on the exact PR head before READY.

## Separate data linkage issue

The affected bank account is correctly recorded under its owner. The corresponding user is active but the user-management UI reports no owner link. This independently prevents account-owner queue routing. Adding that link changes banking access and requires explicit human confirmation; no role, permission or owner link was changed in this fix.

## Risk and release

This changes debit classification of signed ČSOB notices and is payment-sensitive. Review the exact CI result and obtain human release confirmation after this audit before production merge. The old notifications must be reprocessed after release and their signs and queue destination checked. Never choose a property or charge solely to empty the central queue.
