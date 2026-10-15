# Verified development capabilities

Validation performed on 2026-10-14 in the cloud workspace with Node.js 24.19.0 and npm 11.9.0. Database checks used real MongoDB 7.0.24 replica sets, not mocked persistence. The test environment explicitly overrides inherited database/origin/cookie settings and never connects to a user's MONGODB_URI.

| Check                                                                    | Verified outcome                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`              | Frozen dependency installation succeeded                                                                                                                                                                                                         |
| `MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries npm run prepare:db`   | Pinned MongoDB binary downloaded with upstream checksum verification enabled and reused from cache                                                                                                                                               |
| `npm run check`                                                          | JavaScript syntax and static HTML checks passed                                                                                                                                                                                                  |
| `npm run format:check`                                                   | Formatting checks passed                                                                                                                                                                                                                         |
| `MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries npm test`             | **38 passed**, two test files; no skipped or disabled tests in the final run                                                                                                                                                                     |
| `MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries npm run test:browser` | Real Chromium + API + replica-set flow passed on desktop and 390px mobile viewport; no uncaught page errors or mobile horizontal page overflow                                                                                                   |
| `MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries npm run test:startup` | Actual backend entry point initialized DB/indexes, served real pages, denied anonymous API access, set production Secure/HttpOnly cookies, retained a session across restart, revoked it through CSRF-protected logout, and shut down gracefully |
| `MONGOMS_DOWNLOAD_DIR=/workspace/.mongodb-binaries npm run test:local`   | Local development launcher responded to a real health request and retained a uniquely identified verification record across stop/restart; verification record removed                                                                            |
| `npm audit --cache /workspace/.npm-cache --audit-level=high`             | Zero reported vulnerabilities across production and development dependencies                                                                                                                                                                     |

The automated suite checks authentication, expiry/logout, invalid credentials, every role against the permission matrix, CSRF/origin handling, account deactivation, privilege/mass assignment restrictions, password hash exclusion, related-user contact-field exclusion, catalog/archive behavior, unique codes, atomic duplicate-code rollback, concurrent batch creation and borrowing, unavailable items, partial/good/damaged/lost returns, overdue calculations, cross-user privacy, request review and exact issuance, repair transitions, audit creation, safe CSV and query/body validation. It also confirms a reported open repair remains blocking after a good-condition return, request issuance rolls back on mismatched quantities, archived stock cannot be issued and login rate limits remain active.

Browser validation includes admin login, category creation, equipment and bulk item creation with batch review, user creation, physical-item issuance/return, request creation/approval, item QR rendering, damage reporting and repair completion, reports/audit/account pages, mobile navigation, logout, scout login, scout-owned request creation/cancellation, and absence of administrative actions for a scout. The screenshots in `/tmp/scout-storage-desktop.png` and `/tmp/scout-storage-mobile.png` show disposable test fixtures; these accounts and records are not seeded into the development database.

The first database download was denied by the network proxy. The required `fastdl.mongodb.org` domain was saved in the environment draft; a subsequent real request succeeded and database tests ran. No TLS or checksum checks were disabled. Test-tool vulnerabilities discovered in the full audit were resolved by upgrading Vitest to 5.0.4; the final suite uses that patched version.

## Deployment boundaries

- Current-instance development validation succeeded. Reusable install/start instructions and the MongoDB download domain were saved in the cloud environment draft.
- The environment configuration has not been published or validated in a newly restored task by this agent.
- No production MongoDB Atlas cluster, Vercel project, Render/Railway service, DNS record or administrator was created. Production hosting requires the user's configuration and secure first-admin initialization.
- Live deployed cross-origin cookie behavior, third-party cookie restrictions, production Atlas networking, backups/restores, multi-instance limiter storage and production monitoring still need deployment-specific verification. The README describes these requirements.
- CSV exports intentionally cover the current filtered page. Requests validate current availability but do not reserve future inventory. Password recovery is administrator-managed; MFA/email reset/arbitrary file uploads/notifications are outside the implemented scope.

## Stock/photo/cart/theme update

Five regression tests cover initial physical-stock creation and immediate availability/dashboard counts, increasing total stock while preserving borrowed items, rejecting stock reductions atomically, upload decoding and authenticated image delivery with binary/audit-field exclusion, removal and unsafe image rejection, and borrowing multiple equipment types together. Browser checks upload a real PNG, create initial stock, add a batch and verify refreshed counts, issue two tents and one stove through a single cart, return them, and exercise the mobile cart. Updated UI screenshots use the purple/café theme. The image library is upgraded to the patched sharp 0.35.5 release before publication.

## Role/location/return-selection update

Regression tests verify Leader role creation/assignment is rejected, existing Leader accounts migrate to Scout exactly once with session revocation and preserved borrowing history, removed location routes/page return 404, item writes reject location fields and old references are hidden. Browser tests verify the Leader option and Locations navigation are absent. Select all and Clear selection are exercised on a three-item borrowing; Lost checkboxes remain untouched and the items are confirmed as ordinary returns.

## Arabic walkthrough delivery

Three MP4 walkthroughs contain real application footage with isolated demo data and synthesized Arabic narration: ADMIN (19 verified scenes, approximately 5:52), STORAGE_KEEPER (12 scenes, 3:46) and SCOUT (11 scenes, 3:26). All 42 workflow scenes completed their recorded actions and assertions with no uncaught browser errors. H.264 video/AAC audio, complete narration duration, chapter metadata and full decoding were verified. Preview frames were inspected for Arabic text and scene alignment.

`node backend/scripts/test-walkthroughs.js` passed real MP4 range delivery, VTT caption parsing, browser decoding/playback for every role, chapter seeking, desktop/mobile layout and zero browser errors. The new Walkthroughs page lets all logged-in roles choose training videos without changing their actual permissions. The production database and local inventory were not used. Generated files and narration scripts are in docs/walkthroughs; source recording and production helpers are included for optional reproduction.

## Standalone English walkthrough update

English narration, captions and chapter titles reuse the 42 verified demo scenes. The in-app walkthrough page, navigation, styles and public media route were removed at the user’s request. MP4 files are delivered separately for social media sharing.

All three English MP4s passed complete FFmpeg decoding and H.264/AAC/chapter checks; preview frames were inspected for readable English titles and scene alignment. JavaScript/HTML checks, formatting and git whitespace checks passed.

## Clearer neural English voice

All 42 narration scenes were regenerated using Piper LibriTTS high, speaker index 0, at a slightly slower rate with sentence pauses and explicit QR/CSV pronunciation. Verified recording timelines were retimed to prevent narration overlap. The standalone MP4s use AAC at 48 kHz, normalized volume and a final peak limiter. Voice provenance and attribution are in docs/walkthroughs/README.md. No website integration or runtime dependency was added.

All final English files decoded successfully with their expected chapter counts. Measured integrated loudness is between -18.29 and -17.18 LUFS, and true peaks remain below 0 dBTP. SHA256 checksums were refreshed.

## Shorter pauses and background music

The approved English voice recordings were retained. Silence detection trims longer quiet gaps, retaining approximately 140 ms within sentences and a short scene transition; a guard refuses to discard samples above the silence threshold. Full scene footage is retimed rather than dropping actions. Matching chapters and VTT captions were regenerated. An original soft instrumental is mixed more than 22 dB below the narration RMS, with fades and further ducking during speech. All final MP4s passed full decoding, expected chapter counts, end-time alignment, and true-peak checks below 0 dBTP. Verification files record durations, time removed and measured voice/music levels. The website remains unchanged.

## No-card Vercel deployment preparation

A root-level serverless adapter and Vercel configuration bundle Express and the frontend into one deployment. The standalone production startup test passed. The dedicated serverless smoke test passed concurrent cold initialization, the hosted HTTPS origin fallback, static pages/assets, authentication enforcement, Secure/HttpOnly session creation and CSRF logout against a disposable replica set. Vercel account access is still required before build/deployment and live Atlas connectivity can be verified. No live deployment is claimed by these local checks.
