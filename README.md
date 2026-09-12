# Internship Management Portal

React/Vite frontend, Express API, and Supabase PostgreSQL/Storage. Supabase is used only from the server using the service-role key; browser clients use application JWTs.

## Local run

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\backend"
npm install
npm run seed
npm run dev
```

In a second terminal:

```powershell
Set-Location "C:\Users\ABHINAV TEJA\Downloads\module8-SM\frontend"
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. The API health endpoint is `http://127.0.0.1:4000/api/health`.

## First real administrator

The live database is intentionally empty and public signup is disabled. Create the first CRCS Superadmin once, using credentials you choose (do not commit them):

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = "your-admin@university.edu"
$env:BOOTSTRAP_ADMIN_PASSWORD = "use-a-strong-password"
$env:BOOTSTRAP_ADMIN_NAME = "CRCS Administrator"
npm run bootstrap:admin
```

This command refuses to run if a Superadmin already exists. After that, the Superadmin creates schools, departments, cycles, and all other role accounts from the portal.

## Account setup

The deployed environment now keeps only `crcs.admin@example.edu` active with the CRCS Superadmin role. All temporary quick-login UI/API access has been removed, and the Vercel demo-login variables are no longer configured. The other temporary accounts were deactivated rather than deleted so historical relationships remain recoverable.

Do not run `npm run seed` against this environment: that script recreates the disposable demo environment. Sign in as the CRCS Superadmin and create the required real accounts through the portal. Set the server-only values in `backend/.env` from `backend/.env.example` for local development.
