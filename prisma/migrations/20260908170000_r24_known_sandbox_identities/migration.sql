-- Explicitly verified R24 sandbox identities created through UI without a title marker.
-- Metadata only: preserve roles, memberships, passwords, activity and report snapshots.
UPDATE "User" AS u SET "isTestIdentity" = true
FROM (VALUES
  ('r24.novice@flatcloud.test', 'R24 · Novic'),
  ('r24.advanced@flatcloud.test', 'R24 · Pokročilý uživatel'),
  ('r24.external-owner@flatcloud.test', 'R24 · Externí vlastník'),
  ('r24.distribution@flatcloud.test', 'R24 · Šéf distribuce'),
  ('r24.assistant@flatcloud.test', 'R24 · Interní asistentka'),
  ('r24.technical@flatcloud.test', 'R24 · Technický správce'),
  ('r24.units@flatcloud.test', 'R24 · Správce jednotek'),
  ('r24.asset@flatcloud.test', 'R24 · Asset manager')
) AS qa(email, name)
WHERE u.email = qa.email AND u.name = qa.name AND u."isTestIdentity" = false;
