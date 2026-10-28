# StockFlow

A simple, multi-tenant inventory app for small businesses. Owners can create an account and organization, track a product catalog, get low-stock alerts, and set a workspace-wide default threshold.

## Features

- Email and password sign-up and login with bcrypt password hashes and signed JWTs
- Organization-scoped product data and organization-specific SKU uniqueness
- Product create, read, update, delete, and search by name or SKU
- Dashboard product and unit totals, low-stock list, and recently updated products
- Per-product or organization-wide low-stock threshold
- Responsive React interface with input validation and useful empty states

## Requirements

- Node.js 20 or later and npm
- Docker Desktop (recommended for local MySQL), or a MySQL 8 database

## Run locally

1. Copy `.env.example` to `.env` in the repository root. Set `JWT_SECRET` to a long random secret. The example database URL matches the included local Docker database, exposed on port 3307 to avoid conflicts with a locally installed MySQL server.
2. Start MySQL: `docker compose up -d mysql`
3. Install dependencies from the repository root: `npm install`, `npm install --prefix backend`, and `npm install --prefix frontend`.
4. Generate the Prisma client and create/update the database schema: `npm run db:generate` and `npm run db:push`.
5. Start the API and frontend: `npm run dev`.
6. Open [http://localhost:5173](http://localhost:5173). The API listens on port 4000.

To stop MySQL, run `docker compose down`. To also remove the local database volume, run `docker compose down -v` (this deletes local database data).

## Production build

Run `npm run build`. Start the compiled API with `npm run start --prefix backend` and serve the built `frontend/dist` directory from a static host. Set `DATABASE_URL`, `JWT_SECRET`, `PORT`, and `CLIENT_URL` in the backend environment. Set `VITE_API_URL` at frontend build time if the API is hosted at a different origin (for example, `https://api.example.com/api`).

## Deploy to Vercel

The repository includes a root `vercel.json` for Vercel Services. It deploys `backend/` as a Node container and `frontend/` as Vite on one project and routes `/api/*` to the backend. The browser uses the same-origin `/api` path in production; Vite proxies that path to the local API during development.

1. Create a production MySQL database with a provider that accepts connections from Vercel. The local Docker database is only for development and cannot be used by the hosted app.
2. In Vercel, import `MK543-dev/Assessment-for-SDE-intern`. Keep the root directory as `./`, project name `StockFlow`, and choose the **Services** preset. The repo's `vercel.json` defines the frontend and backend services and their routes.
3. In the Vercel project environment variables, add `DATABASE_URL` with the provider's MySQL connection string and `JWT_SECRET` with a new long random secret. Set them for Production (and Preview if you want preview deployments to work; ideally use a separate preview database). The API and browser frontend share one Vercel domain, so no `VITE_API_URL` or service binding is needed.
4. Before the first deployment can serve requests, apply the Prisma schema to the hosted MySQL database. One option is to temporarily put the production `DATABASE_URL` in the local root `.env`, then run `npm run db:push` from the repo root. Keep the URL private and restore your local development URL afterward. Alternatively, use `npx vercel link`, add the production environment variables in Vercel, and run the Prisma command with those production variables in a secure local environment.
5. Redeploy from Vercel after setting the environment variables and initializing the schema. Test signup, login, creating a product, and `/api/health` on the deployed domain.

Vercel Services documentation: https://vercel.com/docs/services

## API

All routes are under `/api`. Authenticated routes require `Authorization: Bearer <token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Health check |
| POST | `/auth/signup` | Create an organization and its owner |
| POST | `/auth/login` | Sign in |
| GET | `/auth/me` | Current user and organization |
| GET | `/dashboard` | Organization inventory summary |
| GET / POST | `/products` | List/search or create products |
| PUT / DELETE | `/products/:id` | Update or delete an organization product |
| GET / PUT | `/settings` | Read/update organization name and default threshold |

## Data isolation

The JWT carries the owner and organization IDs. Every product read, write, and delete is filtered by the organization ID from the verified token; clients cannot choose another organization. Product SKU uniqueness is enforced per organization by a composite database constraint.
