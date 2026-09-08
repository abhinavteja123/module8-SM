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

## QA/demo data

The connected Supabase database is currently clean: the temporary QA/demo records used during verification were removed. Run `npm run seed` only when you explicitly want a disposable QA environment; it is additive and safe to repeat. All temporary demo accounts use `Passw0rd!`.

- `crcs.admin@example.edu` — CRCS Superadmin
- `student@example.edu` — Student
- `faculty@example.edu` — Faculty Mentor
- `coordinator@example.edu` — Faculty Coordinator
- `hod@example.edu` — HOD
- `dean@example.edu` — Dean
- `school.office@example.edu` — School Office
- `crcs.coordinator@example.edu` — CRCS Coordinator

Do not use these demo credentials in a production deployment. Set the server-only values in `backend/.env` from `backend/.env.example`.
