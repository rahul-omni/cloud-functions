# delhiDistrictCourtUpsert – Secret Manager V2 & .env

Uses **secretManagerV2** (bootstrap credentials) for DATABASE_URL. Same setup as highCourtCasesUpsert.

## Secret Manager V2 setup (production)

1. **Bootstrap secret**: `secret-manager-v2-credential` – must exist in the function's project.
2. **DATABASE_URL secret** – Create in the project where your secrets live.

## .env (local / emulator)

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
```
