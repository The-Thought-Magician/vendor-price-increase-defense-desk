# Vendor Price-Increase Defense Desk

Vendor Price-Increase Defense Desk (VPIDD) is a SaaS platform that validates every supplier price-increase letter against the governing contract (caps, fixed-price periods, indexation formulas, notice windows) and the published cost-driver indices the supplier claims to be tracking, then generates a data-backed pushback packet the buyer can send back. It turns a manual, error-prone review into a deterministic, auditable workflow that protects margin one letter at a time.

When a supplier sends an increase letter, a procurement or category manager logs it, links it to the active contract, and the Desk runs a battery of deterministic checks: is the proposed effective date inside a contracted fixed-price period, does the percentage exceed a contractual annual cap, is the supplier inside a contractual notice window, does the claimed index movement actually match the published movement, and have stacked increases quietly breached a cumulative multi-year cap. Each check produces a verdict with the exact clause citation and the index math. The Desk assembles a pushback packet, routes it through an approval workflow with a full audit trail, and rolls the accepted-vs-contested deltas into an annualized P&L margin-impact view.

See `docs/idea.md` for the full product specification and feature breakdown.

## Stack

- **Backend:** Hono (Node, TypeScript, ESM) running on `@hono/node-server`, mounted under `/api/v1`.
- **Database:** Postgres via Neon (`@neondatabase/serverless`) with Drizzle ORM.
- **Frontend:** Next.js 16, React 19, TypeScript (strict), Tailwind 4, App Router.
- **Auth:** Neon Auth (`@neondatabase/auth`). The Next.js proxy resolves the session server-side and forwards a trusted `X-User-Id` header to the backend.
- **Package manager:** pnpm everywhere.

## Project Layout

```
backend/   Hono API server (routes under /api/v1, /health at root)
web/        Next.js app (App Router, auth, /api/proxy passthrough)
docs/       Product spec (idea.md) and audit notes
```

## Local Development

Prerequisites: Node 22+, pnpm, and a Postgres connection string (Neon recommended).

### Backend

```bash
cd backend
pnpm install
# create backend/.env with DATABASE_URL and FRONTEND_URL (see below)
pnpm dev
```

The backend listens on `http://localhost:3001` by default. Health check at `http://localhost:3001/health`.

> Note: tables are provisioned out-of-band (Drizzle schema push / Neon console). The server runs an idempotent seed on boot but does not create its own tables.

### Frontend

```bash
cd web
pnpm install
# create web/.env.local (see below)
pnpm dev
```

The web app runs on `http://localhost:3000` and calls the backend through its own `/api/proxy/*` route, which injects the authenticated user id.

## Environment Variables

### Backend (`backend/.env`)

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
```

### Frontend (`web/.env.local`)

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_API_URL` is the only public variable (baked into the bundle at build time and read by the proxy route). `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are server-only.

## Docker

`docker-compose.yml` brings the backend and web up together:

```bash
docker compose up --build
```

## Deployment

- **Backend:** Render (see `render.yaml`). Build `cd backend && pnpm install`, start `cd backend && node --import tsx/esm src/index.ts`. Set `DATABASE_URL` and `FRONTEND_URL` as Render env vars.
- **Frontend:** Vercel, with root directory `web`, framework `nextjs`, Node 22.x.

## Pricing

All features are free for signed-in users. There is no paid tier or metering; billing is a free-plan stub. Sign in and the entire Defense Desk (letter intake, clause checks, index validation, cumulative-creep tracking, pushback packets, approval workflow, and P&L rollup) is available.
