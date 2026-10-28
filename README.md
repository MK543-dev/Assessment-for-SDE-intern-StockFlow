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
