# Owner-user linkage for bank queue — 2026-10-06

The production owner František Pokorný has bank account `360823107/0300`, but his active user `frantisek.pokorny@flatcloud.cz` has no `Owner.userId` link. Queue routing consequently leaves notices with portfolio administrators. The user explicitly approved linking that identified user and owner after being told the bank-access effect.

This PR adds a superadmin-only form to an owner detail, accepting an existing user's email. The endpoint requires an explicit checkbox, rejects inactive or tenant users and existing links on either side, performs a guarded serializable update, and writes an audit record in the same transaction. It does not change the user's role or portfolio memberships. There is no migration. No production owner link has been written in this PR.

The isolated browser regression checks nonadmin denial, a successful single link with audit and refusal to link the user to a second owner. Production release requires the repository gates and explicit post-audit approval. After release, the one approved owner/user link can be made, then the two identified ČSOB notices must be reprocessed and their signed amounts and queue destination checked. Property and rent allocation stay manual where ambiguous.
