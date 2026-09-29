# Human UX review — 29 September 2026

## Scope

- Product-facing app names and auth messages use FlatBerry. FlatCloud remains the company, consolidated group, and corporate reporting label.
- Invitation, registration, task-notification and SMTP-test messages expose a path to login and the public home page. Expired/invalid invitation and registration links offer the same escape route.
- Login keeps the submitted e-mail for an invalid password in session storage. The password is never persisted there. A self-service reset link is visible.
- Password reset uses a random 256-bit single-use token stored only as SHA-256, expires after 30 minutes, throttles per account and globally, and returns a generic response for unknown/disabled/test accounts. A successful reset increments `sessionVersion` and consumes outstanding tokens. Sandbox/test identities do not receive reset e-mails. SMTP must be configured in the intended environment.
- The additive migration gives established users a persisted Pro default and new users a Basic default. A user's existing mode cookie still takes precedence.
- The management-scope picker is rendered in a viewport-positioned portal, above the sidebar and outside the Basic hero's clipping context. Guide cards receive distinct large icons.

## Verification and release gates

`prisma validate` and production build passed locally. The migration and browser scenarios need an isolated PostgreSQL database and CI. Changes to authentication need the explicit human decision required by `AGENTS.md`; this branch must not be merged or deployed before that decision, the diff audit, and passing migration/browser smoke. The deployment target and any SMTP delivery must be checked separately.
