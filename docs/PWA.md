# PWA release and recovery

## Production behavior

The PWA is part of the same React application as the website. On the production address it uses existing production accounts, sessions, permissions, and inventory. No user/data migration, separate app server, new database, or paid service is required. The preview account notice is compiled out of production builds. Preview credentials are not included in public assets and cannot sign in to production.

Installation remains optional and online-only. Borrowing, returns, requests, and administrative changes follow the same server rules in a browser or installed window. No offline write queue is enabled.

## Release procedure

1. Validate the final commit with `npm run check`, `npm test`, `npm run test:browser`, `npm run format:check`, and `npm run check:release`. The release check builds local production assets and verifies install metadata and exclusion of private preview details. It does not deploy or contact a database.
2. Review the pull request into `scout-storage-app` and confirm the intended Vercel project is `mss-storage` in the existing account. Production variables and the normal database URI must remain unchanged. Preview bootstrap variables stay scoped to the preview branch.
3. Once go-live is approved, merge the reviewed release into the production branch. Its existing Git integration builds with production settings and publishes to `https://mss-storage.vercel.app`. Never promote a preview to transfer its preview environment or database.
4. Check production sign-in using an existing account, role navigation, sign-out, manifest/icons, and cache headers. Do not reset or create production users as part of this release.
5. Open the production URL in Safari on iPhone, tap Share, then Add to Home Screen. Enable Open as Web App if offered. On Android, use the browser's Install app/Add to Home screen option or the in-page button when available.

An installation from the private preview belongs to a different origin. It does not become the production app automatically. Remove the trial icon if desired, and install again from the production URL. Production users use their normal accounts, not preview credentials. A Safari home-screen installation may require signing in again because it can have separate browser storage.

Record the released commit and deployment ID after publishing. Retain the checkpoint below until the installed production app has been verified on a phone. If validation fails, use the source revert procedure under Recovery.

## Checkpoint

The working website was saved at commit `1f8aaf36b2938dddbd594097c469ae1bec1b4337` on `codex/pre-pwa-checkpoint`. The experiment is on `codex/pwa-preview`; the production branch is `scout-storage-app`.

Before the trial, the live Vercel deployment was `dpl_5wCC9LkePgYVtjpGTW5rD3HY24LG`, serving `https://mss-storage.vercel.app`. Creating the preview does not replace this deployment or assign its production domains.

## What is installed

The manifest, PNG Scout icons, and standalone display mode let supporting browsers install this website. Both the sign-in page and Settings include Android and iPhone instructions, and a native Install app button when the browser offers it. You do not need to sign in to find installation instructions. Installation remains optional. No service worker is registered, no offline API data is stored, and no background synchronization is introduced. Internet access is required for application operations.

The browser's HTTP cache rules remain in place. The frontend loads the current unversioned entry file and CSS through revalidation, and versioned chunks retain their immutable caching. A future offline implementation needs its own update, cache invalidation, and recovery review.

## Preview isolation

The manifest link uses `crossorigin="use-credentials"` so protected previews can load install metadata with their access cookie. Check browser installability using a regular profile; private browsing cannot install PWAs.

Vercel previews (`VERCEL_ENV=preview`) explicitly select the `scout_storage_preview` MongoDB database through Mongoose's `dbName` connection option. They never use the database name inherited from the production connection URI. The live database is unchanged. All previews of this project share this separate preview database; it is intended for small test datasets, not copies of production records.

Preview CSRF allows only the exact HTTPS deployment and branch hostnames supplied by Vercel (`VERCEL_URL` and `VERCEL_BRANCH_URL`). Public links prefer the stable branch URL so an installed trial can follow subsequent preview updates. No CORS wildcard is added. Production keeps its existing URL and database settings.

The preview administrator is separate from production users. Bootstrap credentials are scoped to the preview branch and stored encrypted in Vercel; they are not committed. Local trial credentials and access notes belong in ignored `.pwa-preview/` only. Do not reuse production passwords or enter real personal/inventory data in the trial.

Preview builds show a notice on the sign-in page explaining the separate account. This notice is compiled from `VERCEL_ENV` by esbuild; it exposes no passwords. Sign-in includes an optional Show password checkbox for checking typed characters.

Vercel deployment protection remains enabled. Sign into Vercel on your phone using the account that owns this project before testing; an installed window may require signing into Vercel again. A temporary share link is an access credential, not an unrestricted public release, and must not be committed or shared broadly.

The trial uses the existing Atlas cluster and Vercel plan. It adds no paid subscription, but preview builds, functions, connections, and test data share the existing free-plan quotas. Keep the dataset small and avoid generating keep-alive requests.

## Phone acceptance checks

1. Open the exact HTTPS preview link in Chrome on Android or Safari on iPhone. Authenticate with Vercel if prompted, then use the preview application account.
2. Open Settings and follow the installation instructions. Check the Scout icon, app name, and standalone launch. Browser support and menu wording vary.
3. Sign in from the installed app. Check the mobile sidebar/back button, English/Arabic, dark mode, and keyboard behavior.
4. With dummy records only, test equipment, borrowing, returns, requests, and sign-out. Confirm production inventory is unchanged.
5. Disconnect the phone: operations require internet. Reconnect and confirm the app recovers. No offline writes are queued.
6. Reopen the app after a preview update and confirm it loads the updated files. Actual OS installation and launch require a physical-device check; headless browser tests do not replace it.

## Recovery

To stop the experiment, close or uninstall the preview app and keep using the production URL. Production remains on its existing deployment until explicitly released. The checkpoint branch preserves the previous source; do not reset a working directory containing unrelated changes.

If PWA changes are released later and need reverting, restore the pre-PWA source through a reviewed revert/deployment. This first version has no service worker to unregister or offline caches to purge. Releasing a future version still requires explicit approval after preview acceptance.

## Validation and icon authoring

Run `npm run check`, `npm test`, `npm run test:browser`, `npm run format:check`, and `npm run build:vercel`. PWA tests verify metadata/icon dimensions, install event handling, absence of registered workers/caches, mobile overflow, and preview configuration isolation.

Committed icons are generated from `frontend/favicon.svg` using the optional `node scripts/build-pwa-icons.js` authoring tool. Set `CHROMIUM_PATH` if Playwright needs an existing browser. Hosting serves the committed PNGs and requires no image-rendering runtime.

Browser installation behavior follows [MDN's installability guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
