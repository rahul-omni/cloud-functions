# highCourtCasesUpsert – Secret Manager V2 & .env

Uses **secretManagerV2** (bootstrap credentials) so secrets can be in a different project than the function.

## Secret Manager V2 setup (production)

1. **Bootstrap secret** (required): `secret-manager-v2-credential` – contains the dedicated SA key JSON that has access to your secrets. Must exist in the function's project.

2. **DATABASE_URL secret** – Create in the project where your secrets live (can differ from function project):

| Secret name   | Description                                      |
|---------------|--------------------------------------------------|
| **DATABASE_URL** | PostgreSQL connection string for case_details DB |

If secrets are in a different project, pass that project ID when calling (or set `SECRETS_PROJECT_ID` env).

## .env (local / emulator)

In `functions/.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
```
