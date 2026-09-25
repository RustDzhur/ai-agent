# Security

## OpenAI connection

- Each organization stores its own OpenAI project key. Only organization owners and admins can add, rotate or remove it.
- The API validates the key against OpenAI, encrypts it with AES-256-GCM, and stores ciphertext, nonce and authentication tag in a tenant-protected table. The browser receives only a four-character hint.
- `APP_ENCRYPTION_KEY` must be a random 32-byte value encoded as base64. It is stored in the server-only `.env.app` file with mode `0600`, backed up separately, and never committed.
- Provider requests are made server-side. The key is never sent to the browser, written to logs, or passed to the model.
- The assistant has no tools and no access to company email, CRM, files, databases or external actions. Prompts and answers are stored in the user's tenant and are sent to OpenAI for generation.
- The Responses API request sets `store: false`; this controls OpenAI response storage. Firmspace separately stores the prompt and answer for the user's run history.

## Existing workspace controls

Passwords use Argon2id. Sessions use random opaque tokens whose hashes are stored in PostgreSQL; cookies are Secure, HttpOnly and SameSite. Mutating browser requests require an allowlisted origin and a double-submit CSRF token. Login, registration and agent execution are rate-limited. Tenant data uses PostgreSQL row-level security and transaction-scoped user/tenant context.

## Not yet implemented

Email verification, password recovery, invitations, MFA, GDPR export/deletion/retention workflows, OAuth business integrations, document scanning and the full agent tool gateway remain outstanding. Do not upload confidential documents or grant business-system permissions until those controls and integrations are implemented and reviewed.
