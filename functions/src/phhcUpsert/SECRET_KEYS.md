# phhcUpsert – Secret Manager & .env

## Secret Manager keys (production)

Create these secrets in **Google Cloud Secret Manager** (same project as your Cloud Functions):

| Secret name   | Description                                      | Example value              |
|---------------|--------------------------------------------------|----------------------------|
| **DATABASE_URL** | PostgreSQL connection string for case_details DB | `postgresql://user:pass@host:5432/dbname?sslmode=require` |

- **DATABASE_URL**: The same connection string you previously had in Firebase config as `environment.database_url`. The function uses it to connect to PostgreSQL for case details and judgment URLs.

## .env (local / emulator)

For local runs and Firebase emulator, create or update `functions/.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
```

Use the same value as in Secret Manager (or a local/dev database URL).

## IAM

The Cloud Function’s service account needs **Secret Manager Secret Accessor** on the `DATABASE_URL` secret. If you use Firebase’s default, granting access to the secret is usually enough; with a custom SA, attach `roles/secretmanager.secretAccessor` on the secret or project.
