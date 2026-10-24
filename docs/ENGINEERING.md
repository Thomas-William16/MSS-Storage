# Engineering conventions

## Responsibilities and dependency direction

- `frontend/js/*-pages.jsx` owns feature screens. `routes.js` describes each route with named `title`, `load`, and optional `canAccess` properties.
- `frontend/js/ui.jsx` is the stable public UI API. Its implementations live in `ui/`; reusable hooks live in `hooks/`, and formatting helpers in `utils/`. Implementations import leaf modules instead of their own facade to prevent circular dependencies.
- `backend/src/routes/` handles HTTP input and responses. `services/` owns business operations and transactions. Services must not import routes or HTTP middleware.
- `backend/src/policies/` holds authorization rules that services and HTTP handlers can share. `middleware/` handles sessions, CSRF, HTTP permission enforcement, and static delivery. Browser access checks are conveniences; the server remains authoritative.
- `backend/src/serializers/` defines explicit public response shapes. Never return a user document directly or expose credentials, session tokens, or internal error details.
- `shared/` contains environment-independent contracts, such as supported page paths. It must not import frontend or backend code. Frontend and backend must not import each other's implementations.

## Refactoring and clean code

Keep each module focused on one responsibility. Prefer descriptive names and named properties over positional configuration. Extract duplicated rules when their meaning is genuinely shared; avoid speculative abstractions and new packages for small helpers. Preserve existing public URLs, permissions, transactions, error behavior, accessibility, and English/Arabic support when reorganizing code.

Make changes in small, reviewable steps. Use existing behavior tests to verify refactors; add tests when changing behavior or fixing an uncovered defect. Do not duplicate implementation details in tests. Never include generated bundles, credentials, or local database files in source control.

## Checks

- `npm run check` builds the frontend, checks syntax, and checks the runtime dependency graph.
- `npm run check:architecture` independently rejects circular runtime imports and violations of the boundaries above. It inspects modules reachable from the browser and server entry points, including lazy imports; it does not validate every possible design concern or unused file.
- `npm test` checks backend behavior, security, hosting, and frontend contracts.
- `npm run test:browser` exercises the user workflows in a real browser with isolated local data.
- `npm run build:vercel` verifies production packaging. `npm run format:check` checks formatting.

Run checks appropriate to the affected behavior before completing a change. When several React components change, review hook dependencies, loading/error states, accessible controls, and unnecessary rendering or requests.

## Cost and security constraints

Retain the existing free-plan architecture: static frontend assets, the existing backend, and MongoDB. Do not introduce paid services, subscriptions, scheduled keep-alive traffic, or extra infrastructure as part of routine refactoring. Reuse the existing build tools and avoid increasing runtime work without a measured benefit. Keep the configured minimum password length at eight characters and preserve the other existing password and authentication protections.
