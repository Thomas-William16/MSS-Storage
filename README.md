# Scout Storage Management System

A real MongoDB-backed inventory application for Scout groups. React application shell and client-side navigation, Express 5 REST API, Mongoose models, and transactional management of individually coded equipment items.

The shared layout, account controls, mobile navigation, and sign-in form are React components. Existing inventory, reporting, and workflow views run inside an isolated React route adapter; their forms and tables still use the existing DOM helpers. Section links, detail links, query strings, and browser Back/Forward update the current document without a page reload. Existing `.html` URLs remain valid for bookmarks and QR links.

`npm ci` builds the frontend automatically, including production installs with `--omit=dev`. Run `npm run build` after changing frontend JavaScript, or run `npm run dev:frontend` in a separate terminal to rebuild on changes. The Express server serves the local bundle from `frontend/dist`; React does not require a CDN or a relaxed content security policy.

Workflow modules load on demand and preload on section-link hover or focus. Build output reports the total initial JavaScript size, including shared chunks. Deploy the entire `frontend/dist` directory so dynamic imports can resolve. Translation updates process changed text and inserted subtrees; changing language still translates the full page. List filters cancel superseded requests, and independent borrowing-form lookups run in parallel. Inventory availability continues to come from fresh API requests.

The Express server gives content-hashed JavaScript chunks a one-year immutable cache lifetime. HTML, the entry bundle, CSS, and other unversioned files revalidate using HTTP validators so deployments become visible. API responses use `private, no-store`. Category lookups have a separate 60-second in-memory cache that deduplicates concurrent loads and clears on writes, session checks, and authentication failures. It stores no data in localStorage; other users' category changes can take up to 60 seconds to appear. Inventory counts and operational records are not cached by the frontend.

## Features

- Three roles: ADMIN, STORAGE_KEEPER, SCOUT; backend permissions and private-record ownership checks.
- Revocable HTTP-only cookie sessions, CSRF tokens, bcrypt passwords, rate limits, account deactivation, no self-registration.
- Categories, equipment catalog, total stock that creates real items atomically, archive workflow, per-item conditions/statuses, bulk creation and code previews.
- Multi-equipment borrowing cart with quantities, item-code review, concurrent reservation protection, partial returns, damaged/lost outcomes and overdue calculations.
- Multi-equipment requests, approval/rejection/cancellation, separate confirmed issuance and status history.
- Damage reporting, costs and repair workflows, authenticated QR lookup/download/individual and bulk printing.
- Live dashboard, filtered/paginated operational reports, most-borrowed ranking, safe current-page CSV export and audit logs.
- Purple and café responsive sidebar interface, accessible labeled forms, loading/error/empty states and safe DOM rendering.

## Architecture and files

```
frontend/              HTML entry points, React shell, workflow modules, CSS, build output
backend/server.js      DB initialization, index initialization, server and shutdown
backend/src/config/    Runtime environment and replica-set connection validation
backend/src/models/    Mongoose models and indexes
backend/src/middleware/ Authentication, explicit permission matrix, CSRF, Zod validation
backend/src/services/  Transactional inventory, loans, requests, repairs, reports
backend/src/routes/    HTTP/API handlers; auth, catalog, workflows, reports
backend/tests/         Disposable-replica-set API integration tests
backend/scripts/       Secure first-administrator bootstrap, local dev/test tools
scripts/check.js       JavaScript syntax and static page checks
render.yaml            Backend deployment blueprint
.env.example           Non-secret configuration example
```

Business changes and audit events commit in the same MongoDB transaction. Transaction retry handles MongoDB write conflicts; conditional item updates and unique indexes prevent double borrowing and duplicate codes. Per-equipment revisions serialize batch creation, archiving and issuance. Session tokens are random opaque values, hashed in the database (no JWT secret required), never kept in localStorage. TTL cleanup is supplemented with explicit expiry checks.

## Requirements and local startup

Node.js 22.12+ LTS or Node.js 24 LTS (tested on Node 24), npm, and **MongoDB replica set** (MongoDB 7+ or Atlas). Standalone MongoDB is intentionally rejected. Installing dependencies also builds the React frontend.

```sh
npm ci
cp .env.example .env
# Edit .env with your replica-set or Atlas URI.
npm run admin
npm run dev
```

Frontend and backend are served together on port 3000. Open the sign-in page using the configured frontend origin. `npm start` runs the production entry point without file watching. Keep `.env` untracked. Use only your own secure administrator password, entered interactively with terminal echo suppressed. The bootstrap script allows only the first ADMIN and records an audit event; create later users through the user-management page.

For an isolated development database without installing a system MongoDB server:

```sh
npm run dev:local
```

This starts a real single-node MongoDB replica set in the ignored `.local-db/` directory and the actual Express server. It prints a non-secret application address. Stop with Ctrl+C. The tool downloads the pinned MongoDB 7.0.24 binary and verifies its upstream MD5 transport checksum in addition to HTTPS; no checksum bypass is configured. This is development-only, not a production database. Bootstrap the first admin in a second terminal with the URI displayed by the tool in your local `.env`. There are no default users or credentials.

## Environment variables

| Variable           | Purpose                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `MONGODB_URI`      | Private Atlas/replica-set connection string; backend only                       |
| `FRONTEND_URL`     | Exact allowed frontend origin(s), comma-separated; required HTTPS in production |
| `PUBLIC_APP_URL`   | Public frontend origin for QR URLs; required HTTPS in production                |
| `NODE_ENV`         | `development`, `test` or `production`                                           |
| `PORT`             | Backend listening port (default 3000)                                           |
| `COOKIE_SAME_SITE` | `lax` default; `strict` or `none` supported                                     |
| `TRUST_PROXY`      | Trusted reverse-proxy hop count; default 0, Render 1                            |

Keep API configuration in `frontend/js/config.js`: empty `API_BASE_URL` means same-origin; for Vercel set it to your HTTPS backend origin (without `/api/v1`). This public setting contains no secrets.

Use custom domains under the same site (e.g. `storage.example.org` and `api.example.org`) for reliable cookie authentication with `SameSite=Lax`. Default `*.vercel.app` + `*.onrender.com` domains are cross-site: require `COOKIE_SAME_SITE=none`, secure HTTPS, and a browser permitting third-party cookies. Prefer same-site domains or serve both from Express instead of relying on third-party cookies. CSRF protection remains enabled for every cookie policy.

## Testing

```sh
npm run check
npm run format:check
npm test
npm run test:browser
npm run test:startup
npm run test:local
```

The integration suite creates a fresh `mongodb-memory-server` replica set and **never uses MONGODB_URI**. It covers sessions/logout/expiry, bad credentials, every role/permission pair, mass assignment, deactivation, password exposure, catalog/archive, atomic duplicate-code rollback, concurrent batch codes and borrowing, partial/damaged/lost returns, overdue/ownership, requests/issuance, maintenance, database statistics/CSV and audit creation. Browser tests use a separate real replica set with test-only accounts, exercise UI/API flows and desktop/mobile layouts. Production DB deletion is not part of any test script.

To control binary-cache placement in restricted environments:

```sh
MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries npm test
```

`npm run check` is a syntax/static-page check, not an integration test. No formatter-only result is presented as workflow verification. See the actual execution results in `docs/VALIDATION.md`.

## API and business rules

See [docs/API.md](docs/API.md) for routes, JSON request bodies and the full permission matrix. All lists paginate. CSV exports contain the selected **page**, so export each desired page or use the API for complete extraction. Inventory status counts partition items; DAMAGED is an overlapping condition metric and is not added to totals. Requests do not reserve inventory, even when approved; issuance rechecks stock. Availability is current physical stock rather than future-date scheduling/reservations. Dates are stored in UTC; the browser displays/converts local dates. Maintenance costs are numeric amounts in your organization's chosen currency; no currency conversion is performed.

Physical items and borrowing history are never destructively deleted. Equipment is archived (remaining AVAILABLE items become RETIRED) and users deactivated. Equipment photos are no longer supported. Existing image data stays preserved in the database but is hidden; photo uploads and image URLs are rejected by the API. QR codes require normal authentication and do not grant permissions.

## No-card deployment: Vercel Hobby and Atlas Free

Deploy from the repository root using the root `vercel.json`, with Framework set to Other and Node.js 24. `npm run build:vercel` builds React and copies only HTML, CSS, and compiled JavaScript into `public/`. Vercel serves these directly as static files; only `/api/*` and `/health` are rewritten to the API function. Loading a page or asset no longer starts a function or initializes a database connection. The `api/index.js` adapter reuses a small database pool on warm invocations. Source code, environment files, local databases, and walkthrough videos are not published as static files.

Set the encrypted production `MONGODB_URI` in Vercel to your Atlas replica-set connection string and `TRUST_PROXY=1`, `COOKIE_SAME_SITE=lax`, `NODE_ENV=production`. The public URL and allowed browser origin default to Vercel's production hostname, so leave frontend `API_BASE_URL` empty. Explicit FRONTEND_URL/PUBLIC_APP_URL values still override the platform default. Use the production address to test sign-in and QR labels.

Vercel Hobby is intended for personal/noncommercial use and has usage limits. Atlas Free remains subject to its storage and network limits. The general API limiter and first login guard are per instance; additional IP/account login counters use the existing Atlas database so login throttling persists across instances. Initialize the first administrator securely with `npm run admin` from an interactive machine permitted by Atlas; do not place administrator passwords in deployment commands.

Performance improvements use browser caching, Vercel static delivery, and small browser-memory caches. No Redis, paid cache, paid monitoring, or scheduled keep-alive service is required. Free-plan quotas still apply; this configuration does not guarantee unlimited usage. If using the Render Free alternative, idle services can spin down and the first API call may wait for startup; browser caching cannot remove that delay. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Render Free](https://render.com/docs/free).

`MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries node backend/scripts/test-serverless.js` verifies the handler locally with a disposable replica set, including concurrent cold initialization, production origin fallback, frontend/assets, authenticated API access and CSRF logout. A live Vercel deployment still requires account access, an Atlas network policy allowing its connections and checks against the actual deployed URL.

## Atlas, Vercel and backend deployment

1. Create an Atlas cluster (replica-set capability), database and a dedicated application database user with least required permissions. Configure Atlas network access for your backend host's egress addresses; avoid a permanent unrestricted IP allowlist. Store the URI in your backend host's secret settings.
2. Deploy the repository on Render using `render.yaml`, or Railway with build `npm ci --omit=dev` and start `npm start`. Configure all required environment variables; use the real trusted proxy hop count. `/health` is the health check. Startup establishes DB connectivity and initializes indexes before accepting traffic.
3. Bootstrap your first admin using `npm run admin` from a secure interactive machine with the production backend environment and trusted database connectivity. Do not place passwords in command arguments, deployment files or source.
4. For a separate static frontend deployment, enable access to files outside the Vercel project Root Directory **frontend**, use install command `npm --prefix .. ci --omit=dev`, build command `npm --prefix .. run build`, and static output `.`. Set `frontend/js/config.js` to the deployed API HTTPS origin before building. `frontend/vercel.json` applies security headers. Tighten its `connect-src` from `https:` to your exact backend origin for the final deployment.
5. Set backend `FRONTEND_URL` and `PUBLIC_APP_URL` to the frontend HTTPS origin; choose same-site custom domains and verify login/CSRF/logout, QR lookup, one complete borrow/return flow and responsive layout on the deployed origins.
6. Configure monitoring for DB availability, HTTP errors and storage capacity. Serve TLS on both hosts. Schedule backups and test restores before storing real user information.

The separate frontend-only configuration in `frontend/vercel.json` serves static assets and requires an external backend. The root Vercel configuration serves static browser files alongside the serverless API under the same origin. No cloud resources are created or published automatically by this repository.

## Security and operational guidance

- Passwords hashed with bcrypt cost 12; passwords and hash fields excluded from APIs. Sensitive inputs never inserted into HTML strings.
- Origin allowlist and session-bound CSRF token protect writes; CORS sends credentials only to configured origins. Helmet, JSON body limits, Zod strict bodies and bounded query fields reduce attack surface.
- MongoDB unique indexes are required, not optional frontend checks. Index initialization runs before traffic. Configure migrations/index reviews for larger live deployments; avoid blind index removal.
- Login has a per-instance guard of 20 attempts per 15 minutes and shared database guards of 20 attempts per account and 100 per IP per fixed 15-minute window. Shared counters contain hashed identifiers and expire through a TTL index; no Redis subscription is required. Use a correctly configured trusted proxy to avoid spoofed client addresses. The general API limiter remains per instance.
- New or changed passwords require 8–72 characters, at most 72 UTF-8 bytes, and reject selected common or single-character repeated values. Existing passwords can still sign in; there is no forced password-reset workflow. Bcrypt cost 12 remains enabled. Public user responses use a validated field allowlist, and frontend text rendering escapes user content instead of interpreting it as HTML.
- Only intentional application errors expose their messages. Unexpected errors use a generic response; server-side logs retain an error identifier and stack locations without request bodies, credentials, or raw exception messages. Public static routes exclude source files, dotfiles, and directory paths.
- Audit entries are append-only through application routes, but not cryptographically tamper-proof. Restrict direct DB credentials. Session expiration is absolute (8 hours), not sliding.
- Session settings and public URL configuration should be reviewed for your own domains. Production cookie behavior must be validated in deployed browsers.
- No email/password-reset flow, email verification, MFA, notifications, arbitrary file uploads, future inventory reservations or multi-organization tenancy is implied. Accounts/password resets are administrator-managed.

## Backup and restore

For a free-only setup, make manual encrypted backups with authenticated `mongodump` and test `mongorestore` against a separate local replica set. Supply credentials securely, not through shell history. Atlas Free's optional managed backup subscription is paid; do not enable it as part of the free-only configuration. See [Atlas Free cluster backups](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/). Back up all application collections together to preserve references, counters, indexes and history. Never restore test data over production. Verify counts, indexes, borrowing lines and outstanding-item statuses after restoring; revoke Session records after a disaster recovery if appropriate.

## Troubleshooting

- Startup fails: check MONGODB_URI presence and TLS/Atlas network policy, replica-set readiness, user permissions and unique index conflicts. The logger intentionally does not print private URIs.
- Login write returns 403: ensure the browser Origin exactly matches FRONTEND_URL and API_BASE_URL uses the correct backend; writes after login need the token from `/auth/me`.
- Login does not persist on split hosting: check HTTPS, SameSite policy, third-party cookie restrictions and use same-site custom domains.
- Borrowing 409: refresh item selection; another keeper may have issued an item or an item may be damaged/archived.
- Archive 409: resolve active maintenance, outstanding borrowing and pending/approved requests first.
- Replica-set test download blocked: allow `fastdl.mongodb.org` and reuse the verified binary cache; do not disable TLS or checksum verification.
- npm cache not writable: use `npm ci --cache /workspace/.npm-cache` in the cloud workspace.

## Equipment stock and borrowing cart

New equipment asks for **Total stock**, not a minimum-stock threshold. Entering 3 creates three individually coded GOOD/AVAILABLE physical items together with the equipment record. Availability and dashboard totals come from these real records, and detail counts refresh immediately after adding a batch. Editing total stock upward adds the difference (up to 500 per operation). Reductions are rejected to preserve individual item and borrowing history; retire items through the item workflow. The legacy minimumStock API field remains for existing low-stock settings.

Existing equipment created with no physical items stays at zero until you edit its total stock or add physical items. The cart clearly labels zero-stock equipment; it does not invent stock. Add quantities of several equipment types, adjust/remove cart lines, review the selected item codes, select the borrower and due date, and confirm a single issuance. The server revalidates and reserves all items atomically; up to 100 physical items per issue. Equipment requests still require exact approved quantities at issuance.

### Updating a downloaded Windows copy

Stop the running app with Ctrl+C before updating. Download the newest scout-storage-app branch ZIP and extract into a **new folder**. Copy your existing ignored `.env` file and `.local-db` directory into that new project folder to retain account and inventory data. Do not copy `node_modules`. Open PowerShell in the new folder, run `npm ci`, then `npm run dev:local`. Keep the old folder as a backup until your accounts and inventory are verified. Never copy a live MongoDB data directory while its server is running.

## Simplified roles and returns

Only ADMIN, STORAGE_KEEPER and SCOUT are supported. On startup, existing LEADER accounts are migrated transactionally to SCOUT; their IDs, passwords and borrowing/request history are retained, their old sessions are revoked, and the conversion is audited. Sign in again after updating. Locations are removed from navigation, forms, reporting and API routes. Legacy location collections/references remain hidden for preservation; no location data is accepted by the API.

In Record returns, **Select all** selects only outstanding return rows. **Clear selection** clears those rows. Neither changes return conditions, notes or Lost checkboxes. Returned/resolved items are excluded, and saving still uses the normal audited return transaction.

## Standalone role walkthrough videos

English MP4 videos for Administrator, Storage Keeper and Scout are in [docs/walkthroughs](docs/walkthroughs/README.md). Download the files for sharing or posting on social media. They include real app demonstrations using isolated demo data, computer-generated English narration, and chapter titles. Optional full captions are provided as VTT files. Arabic versions remain available in the same folder. Videos are standalone assets; there is no video page or media endpoint in the app.

Recording and narration tools are optional production helpers, not application dependencies.

## Everyday use

The dashboard shows role-specific shortcuts: Scouts can request equipment or open their borrowings; Admins and Storage Keepers can issue equipment or open returns. Active and partially returned borrowings have a Return items action in the list. The existing condition, damage, loss and ownership rules apply to these returns.

Admins can create a category beside the category dropdown while adding or editing equipment. The equipment draft is retained, the new category is selected, and the list filter updates immediately. Availability shows available items out of total stock. Requests flag unavailable stock and quantities above current availability; requests for future activities remain possible and do not reserve stock.

Success notices describe completed actions, including the number returned, marked lost and still outstanding. Arabic/English and dark-mode preferences are saved in the browser. Arabic uses RTL layouts and localized Gregorian dates; mobile returns use labeled cards so notes and condition controls stay usable.
