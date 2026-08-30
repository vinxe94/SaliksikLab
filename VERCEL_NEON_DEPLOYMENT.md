# Vercel + Neon Deployment

This setup uses:

- Neon for PostgreSQL
- Vercel project 1 for the Django backend
- Vercel project 2 for the React/Vite frontend

## 1. Create The Neon Database

1. Go to Neon and create a new project.
2. Open the project dashboard and click **Connect**.
3. Choose a pooled connection string if Neon offers one for your branch.
4. Copy the connection string. It should look like:

```env
postgresql://user:password@host/dbname?sslmode=require&channel_binding=require
```

Use this as `DATABASE_URL` in Vercel.

## 2. Deploy The Django Backend To Vercel

Create a new Vercel project from this GitHub repo.

Set:

- Root Directory: `backend`
- Framework Preset: Other
- Build Command: `python manage.py collectstatic --noinput`

Add these environment variables in Vercel:

```env
SECRET_KEY=<generate-a-long-random-django-secret>
DEBUG=False
DATABASE_URL=<your-neon-connection-string>
ALLOWED_HOSTS=.vercel.app
CORS_ALLOWED_ORIGIN_REGEXES=^https://.*\.vercel\.app$
CSRF_TRUSTED_ORIGINS=https://*.vercel.app
FRONTEND_URL=https://<your-frontend-project>.vercel.app
DDOS_TRUST_PROXY_HEADERS=True
```

After the backend deploys, copy its production URL.

## 3. Run Database Migrations

Vercel serverless functions do not run a long-lived startup command, so run migrations manually after setting up Neon:

```bash
cd backend
DATABASE_URL="<your-neon-connection-string>" DEBUG=False python manage.py migrate
```

Create an admin user the same way:

```bash
cd backend
DATABASE_URL="<your-neon-connection-string>" DEBUG=False python manage.py createsuperuser
```

If you use Vercel CLI, you can also pull the backend environment variables and run:

```bash
cd backend
vercel env pull .env.local
python manage.py migrate
python manage.py createsuperuser
```

## 4. Deploy The React Frontend To Vercel

Create a second Vercel project from the same GitHub repo.

Set:

- Root Directory: `frontend`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Add this environment variable:

```env
VITE_API_BASE_URL=https://<your-backend-project>.vercel.app/api
```

Redeploy the frontend after adding the variable.

## 5. Update Backend Frontend URL

Go back to the backend Vercel project and set:

```env
FRONTEND_URL=https://<your-frontend-project>.vercel.app
```

Redeploy the backend.

## 6. Important Upload Storage Note

Neon stores database rows only. It does not store uploaded PDFs or avatars.

Vercel Python functions use ephemeral local storage, so `backend/media` is not reliable for production uploads. Before real users upload files, add object storage such as Vercel Blob, S3, Cloudinary, or another Django storage backend.

Until object storage is added, auth, metadata, admin screens, and database-backed features can deploy, but uploaded files may disappear or fail between deployments/function instances.
