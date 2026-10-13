# API and permission matrix

All routes use `/api/v1`, except `GET /health`. Success: `{data, meta?}`. Error: `{error:{message}}`. IDs are MongoDB ObjectIds. UTC ISO 8601 dates with offsets are required. Lists use `page` (1+), `limit` (1–100), and supported `search`, `status`, `category`, `from`, `to` filters. CSV exports contain the **current filtered page**.

Browser authentication uses an opaque random session cookie (HttpOnly, Secure in production, SameSite configurable), backed by MongoDB with an eight-hour absolute expiry. Login requires the configured Origin. Get the CSRF token from login or `/auth/me`, keep it in memory, and send it as `X-CSRF-Token` on every write, with `credentials: include`. Login is Origin-checked without requiring an existing CSRF token. Logout deletes the database session. Deactivation, password changes and role changes revoke existing sessions. No public registration endpoint.

| Capability                              | ADMIN             | STORAGE_KEEPER    | SCOUT                         |
| --------------------------------------- | ----------------- | ----------------- | ----------------------------- |
| View inventory, items, QR and dashboard | Yes               | Yes               | Yes                           |
| Manage equipment and physical items     | Yes               | Yes               | No                            |
| Read categories                         | Yes               | Yes               | Yes                           |
| Write/delete categories                 | Yes               | No                | No                            |
| Issue/return/correct borrowings         | Yes               | Yes               | No                            |
| Read borrowings                         | All               | All               | Own                           |
| Create/read/cancel requests             | All               | All               | Own                           |
| Approve/reject requests                 | Yes               | Yes               | No                            |
| Report damage                           | Any eligible item | Any eligible item | Own outstanding borrowed item |
| Read maintenance                        | All               | All               | Own reports                   |
| Update/complete maintenance             | Yes               | Yes               | No                            |
| Operational reports/CSV                 | Yes               | Yes               | No                            |
| Borrower directory                      | Yes               | Yes               | No                            |
| Manage users and audit logs             | Yes               | No                | No                            |

Scouts see only their own private records. LEADER is no longer a supported assignment; existing Leader accounts are converted to SCOUT on startup with session revocation and an audit event. Keeper user-list access supports borrower selection and excludes password hashes. Related user references on borrowing, request, maintenance and report responses contain only display names/roles, excluding contact fields. The dashboard gives inventory totals to all roles; personal borrowing/request counts are scoped for non-operational roles. Permission implementation: `backend/src/middleware/security.js`, tested against representative endpoints for every role.

## Authentication and users

- `POST /auth/login`: `{email,password}` → `{user,csrfToken}` plus session cookie.
- `GET /auth/me`: `{user,csrfToken}`.
- `POST /auth/logout`: revokes the current session.
- `GET /users`: paginated borrower directory (admin/keeper).
- `GET /users/:id`: admin only.
- `POST /users`: `{name,email,password,phone?,role}` admin only. Password at least 12 characters, at most 72 UTF-8 bytes.
- `PATCH /users/:id`: whitelisted optional fields from create schema. Password/role updates revoke sessions. Admin cannot demote self.
- `PATCH /users/:id/status`: `{isActive:boolean}`; admin cannot deactivate self.

## Catalog

- `GET/POST /categories`: create body `{name,description?}`.
- `PATCH/DELETE /categories/:id`: edits or delete unused records. References block deletion.
- `GET/POST /equipment`: create `{name,category,description?,totalStock?,photo?:{data:base64},minimumStock?,imageUrl?}`. Total stock creates real available items in the same transaction (at most 500 added per operation). Photo data is a JPEG/PNG/WebP file, max 5 MB decoded and 16 million pixels; it is decoded and normalized to JPEG before MongoDB storage. Legacy imageUrl remains optional for compatibility.
- `GET /equipment/:id/photo`: authenticated JPEG image response, never raw photo bytes in equipment JSON. PATCH accepts photo replacement or `photo:null` to remove; omitted photo keeps the current image. PATCH totalStock may increase actual item count, but cannot remove existing items/history.
- `GET/PATCH/DELETE /equipment/:id`: DELETE archives, retires AVAILABLE items, preserves all items/history, rejects unresolved loans, maintenance or requests. No destructive equipment deletion.
- `GET/POST /equipment/:equipmentId/items`: create one with `{itemCode?,serialNumber?,condition?,notes?}`.
- `POST /equipment/:equipmentId/items/bulk`: `{quantity:1..500,codes?:string[],condition?,notes?}`. Transactional, all-or-nothing, custom codes unique and quantity-matched.
- `GET /equipment/:equipmentId/items/preview?quantity=N`: provisional generated codes; concurrent creation may advance counters before confirmation.
- `GET/PATCH /items/:id`: update only `{serialNumber?,condition?,notes?,status?}`. Direct statuses limited to AVAILABLE/LOST/RETIRED for non-borrowed, non-maintenance items. Borrowed/maintenance state changes use their workflows.
- `GET /items/:id/qr`: authenticated SVG encoding `${PUBLIC_APP_URL}/equipment-item.html?id=...`. Item history is supplied only to operational roles.

Status totals partition physical items. DAMAGED is a condition count and overlaps the status totals; **do not sum it into total inventory**. Codes include a readable name prefix, equipment ID suffix and an atomic per-equipment sequence. Custom codes must use uppercase letters, digits and hyphens.

## Borrowings

- `GET /borrowings`, `GET /borrowings/:id`: operational roles see all; others see own. Detail includes physical item lines and return history.
- `POST /borrowings`: `{user,itemIds:[unique IDs],expectedReturnDate,purpose,notes?,requestId?}`. Future return date required; active borrower; all items AVAILABLE, non-damaged, unarchived. Transaction retries serialize competing writes. Either every selected item is borrowed or none.
- `POST /borrowings/:id/return`: `{items:[{itemId,condition,lost?:boolean,notes?}]}`. Each item must be an outstanding line of this borrowing. Good/new/fair → AVAILABLE, damaged → MAINTENANCE, lost → LOST. PARTIAL until no outstanding lines remain; then RETURNED. History retained.
- `POST /borrowings/:id/cancel`: `{notes}`. Staff-only correction for erroneous issuance when no item has been returned. Confirm items never physically left storage. All lines retained with CANCELLED resolution; no history deletion.

## Requests and maintenance

- `GET/POST /requests`: create `{items:[{equipment,quantity}],neededFrom,neededUntil,purpose}`; no duplicate equipment entries. Dates must form a valid non-expired range.
- `GET /requests/:id`: own or operational; includes status history.
- `POST /requests/:id/approve`, `/reject`, `/cancel`: `{notes}`. Approval checks current inventory but **does not reserve or issue**. Stock is checked again during issuance. Only owner/staff may cancel PENDING/APPROVED requests.
- Issue an approved request via borrowing `requestId`; selected physical items must exactly match approved quantities and borrower. Atomic request transition to ISSUED; unique request borrowing index prevents duplicate issuance.
- `GET/POST /maintenance`: create `{equipmentItem,description}`. Damage blocks future borrowing. A borrowed item stays BORROWED until returned, with condition DAMAGED. Only one open repair per item.
- `PATCH /maintenance/:id`: `{status?:OPEN|IN_PROGRESS,cost?,notes?}`.
- `POST /maintenance/:id/complete`: `{condition:NEW|GOOD|FAIR,restore:boolean,cost?,notes?}`. Item must be returned and in MAINTENANCE. A lost/retired item may have its repair record closed only with restore=false, preserving its LOST/RETIRED status. Explicit restore confirmation → AVAILABLE; otherwise RETIRED.

## Reports and audit

- `GET /reports/dashboard`: database counts, low-stock, recent loans, pending requests, overdue loans and recent operational activity.
- `GET /reports/inventory`, `/borrowings`, `/overdue`, `/damaged`, `/lost`, `/maintenance`, `/most-borrowed`: pagination, category and UTC date range filters. Date ranges filter record creation; overdue uses outstanding loan state and expectedReturnDate.
- `?format=csv`: download the current page, escaped/quoted with spreadsheet formula prefixes neutralized.
- `GET /audit-logs`: admin only, pagination/date filters. Sensitive changes are audited inside the same transaction as their state changes. Passwords, sessions, database URIs are excluded from audit detail.
- `GET /health`: database ping; 200 when connected, 503 otherwise. Startup refuses standalone MongoDB because inventory transactions require a replica set or sharded deployment.

Location routes now return 404. Location fields in item writes are rejected. Legacy stored location references are excluded from API responses.
