# Northstar ERP

A full-stack ERP built from the original *Journal Management CRM* design:

| Layer | Technology | Folder |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript, original glass UI | [`frontend/`](frontend/) |
| Backend | Node.js + Express 5 REST API, Zod validation | [`backend/`](backend/) |
| Database | Supabase (PostgreSQL) + Supabase Auth | [`database/supabase/`](database/supabase/) |

The browser signs in with Supabase Auth and sends the session token to the Node API. The API checks the
token and the user's role on **every** request, then talks to Supabase with the service role key, which
never reaches the browser. Row level security is enabled on every table with no client data policies,
so the public anon key cannot read or write ERP data directly.

```
frontend/   app/ (routes) · components/ · hooks/ · lib/ · services/ · types/
backend/    src/{config,controllers,middleware,routes,services,utils,validators} · scripts/seed.ts · tests/
database/   supabase/migrations/*.sql
client/, server/, drizzle/   the original Vite/tRPC app (kept for reference; not used by the new stack)
```

---

## 1. Prerequisites

- Node.js 20 or newer (tested on Node 24)
- A Supabase account

## 2. Create the Supabase project

1. In the Supabase dashboard create a project (any region; the free plan is enough).
2. Open **Project Settings → API keys** and note:
   - the **Project URL**
   - the **anon / publishable** key (safe for the browser)
   - the **service_role / secret** key (server only — never commit it)
3. **Authentication → Providers → Email**: keep Email enabled. Users are created by an admin from the
   Settings page (or by the seed script), so public sign-ups can be turned off.

## 3. Run the database migrations

Apply the three files in `database/supabase/migrations/` **in order**:

| File | Creates |
|---|---|
| `20260914000001_schema.sql` | tables, constraints, indexes, triggers |
| `20260914000002_transactions.sql` | atomic transaction functions and report aggregates |
| `20260914000003_views_and_security.sql` | read views, row level security |

Either paste each file into **SQL Editor → New query → Run**, or use the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref> --workdir database
npx supabase db push --workdir database
```

## 4. Set environment variables

Nothing secret is hardcoded. Create these two files.

**`backend/.env`**

```ini
NODE_ENV=development
PORT=4000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>
# Comma-separated browser origins allowed to call the API
FRONTEND_ORIGIN=http://localhost:3000
# Used for "today", "this week", …
APP_TIMEZONE=Asia/Karachi
# Optional: password for the demo users created by the seed script
SEED_PASSWORD=Northstar#2026
```

**`frontend/.env.local`**

```ini
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

`backend/.env.example` and `frontend/.env.example` hold the same templates. The backend refuses to
start and lists what is missing if a variable is wrong.

## 5. Install dependencies

```bash
cd backend  && npm install
cd ../frontend && npm install
```

## 6. Seed demo data (development only)

```bash
cd backend
npm run seed          # empty database only
npm run seed:reset    # wipes ERP data (keeps user accounts) and seeds again
```

The seed creates departments, employees, categories, suppliers, customers and products, then runs
purchases, sales (one cancelled), payments, a sales return, a purchase return, a stock adjustment and
expenses **through the API's own services**, so every stock level and balance comes from real
transactions. It refuses to run when `NODE_ENV=production`.

Demo logins (password `Northstar#2026` unless `SEED_PASSWORD` is set):

| Role | Email | Access |
|---|---|---|
| Admin | admin@northstar.test | everything, including users, settings, expenses, workforce |
| Manager | manager@northstar.test | sales, purchases, inventory, customers, suppliers, reports |
| Sales staff | sales@northstar.test | sales, returns on sales, customers, product lookup |
| Inventory staff | inventory@northstar.test | inventory, purchases, purchase returns, suppliers |

## 7. Start the apps

```bash
# terminal 1
cd backend && npm run dev          # http://localhost:4000/api  (health: /api/health)

# terminal 2
cd frontend && npm run dev         # http://localhost:3000
```

Production: `npm run build && npm start` in each folder.

> If port 3000 is taken, run `npx next dev -p 3002` and add `http://localhost:3002` to `FRONTEND_ORIGIN`.

## 8. Tests

```bash
cd backend
npm test            # unit tests: invoice pricing, discount/tax allocation, return valuation, P&L
npm run test:e2e    # end-to-end against your Supabase project (needs backend/.env)
npm run typecheck
cd ../frontend && npm run typecheck
```

The end-to-end suite starts the API in-process, creates a temporary user per role, and checks:
purchase → stock and payable, sale → stock and receivable, overselling / invalid quantity / unpaid walk-in
rejection, customer and supplier payments, sales and purchase returns, sale edit and cancel, expenses,
profit & loss and dashboard figures, CSV export, role-based authorization, delete protection and a
database integrity check. Its documents are dated 2031-01-15 and prefixed `E2E`, so they stay out of
current-period figures; the temporary users are deleted afterwards.

---

## How the ERP stays connected

| Event | Stock | Party balance | Cash / bank ledger | P&L |
|---|---|---|---|---|
| Purchase | + quantity; weighted-average cost updated | supplier payable + unpaid part | − paid part | — |
| Sale | − quantity (never below zero) | customer receivable + unpaid part | + paid part | revenue, COGS at current cost |
| Customer payment | — | receivable − amount (oldest invoices first, or a chosen one) | + amount | — |
| Supplier payment | — | payable − amount | − amount | — |
| Sales return | + quantity | receivable reduced first, remainder refunded | − refund | revenue and COGS reversed |
| Purchase return | − quantity | payable reduced first, remainder refunded by supplier | + refund | — |
| Sale / purchase cancel | open quantity reversed | totals reversed | paid amount refunded | excluded |
| Expense | — | — | − amount | operating expense |
| Stock adjustment | ± quantity with reason | — | — | — |

- **Revenue** = sales excluding tax − sales returns excluding tax
- **COGS** = units sold × cost at time of sale − cost of returned units
- **Gross profit** = revenue − COGS; **net profit** = gross profit − operating expenses

**Where the logic lives.** The Node service layer validates input, prices every line, spreads invoice
discounts and tax across lines, values returns and derives every P&L figure. Each money or stock event is
then written by one PostgreSQL function (`erp_create_sale`, `erp_record_party_payment`, …). That makes it a
single transaction, and the function re-checks stock and balances under row locks, so two users selling the
last unit at the same time cannot both succeed. `erp_integrity_check()` compares every stored balance
against the transactions behind it.

Every stock change is written to `stock_movements` (shown on the **Inventory → Stock history** page), and
every money movement to `payments`. `payment_allocations` records which invoice each payment or refund
applies to.

## REST API

All routes are under `/api` and need `Authorization: Bearer <supabase access token>` (except `/api/health`).
Lists accept `page`, `pageSize` (≤100), `search`, `sort`, `order`, `from`, `to`. Errors come back as
`{ "error": { "code", "message", "details"? } }` with 400/401/403/404/409 status codes; database internals
are never exposed.

| Resource | Endpoints |
|---|---|
| Auth | `GET /auth/me` · `GET/POST /auth/users` · `PATCH /auth/users/:id` · `GET/PUT /auth/settings` |
| Dashboard | `GET /dashboard?range=today\|week\|month\|year\|custom&from&to` |
| Products | `GET/POST /products` · `GET /products/low-stock` · `GET/PUT/DELETE /products/:id` |
| Categories | `GET/POST /categories` · `GET/PUT/DELETE /categories/:id` |
| Stock | `GET/POST /stock-adjustments` · `GET /stock-movements` |
| Customers / suppliers | `GET/POST /customers` · `GET/PUT/DELETE /customers/:id` (same for `/suppliers`) |
| Sales | `GET/POST /sales` · `GET/PUT /sales/:id` · `GET /sales/:id/invoice` · `POST /sales/:id/cancel` |
| Purchases | `GET/POST /purchases` · `GET/PUT /purchases/:id` · `POST /purchases/:id/cancel` |
| Returns | `GET/POST /sales-returns` · `GET /sales-returns/:id` (same for `/purchase-returns`) |
| Payments | `GET/POST /payments` |
| Expenses | `GET/POST /expenses` · `GET/PUT/DELETE /expenses/:id` |
| Reports | `GET /reports` · `GET /reports/:type` (`sales`, `purchases`, `inventory`, `customers`, `suppliers`, `expenses`, `payments`, `profit-loss`), add `format=csv` to export |
| Workforce | `/departments`, `/employees`, `/operations`, `/attendance`, `/tasks` (full CRUD, admin) |

## Notes and limits

- Invoices with returns can no longer be edited; cancel or return instead. A paid invoice's customer or
  supplier cannot be changed.
- Weighted-average cost is not rolled back when a purchase is edited, returned or cancelled.
- Payments are ledger records and cannot be deleted; correct mistakes with a refund, return or cancellation.
- The original app's backdrop image was served by Manus storage and is not available outside it; the
  gradient layers of the design are unchanged.
