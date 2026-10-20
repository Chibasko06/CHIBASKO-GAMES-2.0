# Client build validator service

Asynchronous static inspection of uploaded Web builds. No game JS is executed.
This service has no dependency on Pong, its SDK, Next.js or the game-server.

For manual admin review, run `npm run review:game -- <upload-id>` with local server
credentials. This command reuses the same validator without consuming the Queue.
See the [manual review workflow](../../docs/manual-build-review.md).

Build from the platform checkout: `npm run build:distribution`.
Run the resulting Node 24 service: `node .distribution/validator/main.mjs`.
The standalone production build is `npm run build:validator`; container, resource
budgets, shutdown, secrets and rollout commands are documented in the
[production runbook](../../docs/build-validator-production.md).
Do not run it until private storage, the migrations and Queue are configured.
No service or cloud resources are provisioned by these commands.

The separate scheduled dispatcher reads the transactional outbox and sends **text
JSON** messages (`validate_game_build`, uploadId only) to Cloudflare Queues.
`wrangler.dispatcher.example.jsonc` is an example, not a portal deployment change.
Production uses `cloudflare/wrangler.dispatcher.production.jsonc`; see the
[dispatcher runbook](../../docs/build-dispatcher-production.md) for bounded delivery,
retry semantics, secrets and the existing HTTP Pull consumer.
The validator uses a pull consumer (batch 1, visibility two hours), preventing a
large ZIP from depending on a portal request/Worker memory budget. Configure a
dead-letter queue and alerting before operation. DB leases/outbox remain the
source of work even if delivery is lost. A scheduled dispatcher must keep running
to recover expired leases. Queue setup is an operator step, never a developer API.

Required runtime environment variable **names**, with no values in this repo:

- Portal: `GAME_DISTRIBUTION_UPLOADS_ENABLED=1`, existing Supabase URL/service key;
  `GAME_BUILDS_R2_ACCOUNT_ID`, `GAME_BUILDS_R2_ACCESS_KEY_ID`,
  `GAME_BUILDS_R2_SECRET_ACCESS_KEY`, `GAME_BUILDS_STAGING_BUCKET`.
- Dispatcher: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, queue producer binding.
- Validator: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, the R2 variables above,
  `GAME_BUILDS_ARTIFACTS_BUCKET`, `GAME_BUILDS_QUEUE_ID`, `GAME_BUILDS_QUEUE_TOKEN`.

The last credential is a future Cloudflare Queue service credential, **not** a
GitHub PAT. No credential is created/configured by this phase. Use least privilege,
private buckets with no public domain/r2.dev, and separate credentials per service
where possible. Staging needs multipart/read/delete; artifacts need conditional
write/read/delete for retry/GC. Never log environment, signed URLs, messages or HTTP
Authorization. Errors are fixed event codes. Portal requests authenticate explicit
Bearer tokens; no cookie-only API access. CI can use the same API with a valid
platform session; developer machine tokens/OAuth automation are not built here.

Staging CORS must allow only approved portal/developer origins, method PUT,
the necessary request headers, and expose ETag if a client wants it. The backend
still lists parts itself. CORS is not authorization: URL signatures remain the
authority, with short expiry and exact signed lengths. CLI traffic does not need
CORS. Neither CORS nor buckets are changed automatically by this repository.

## Isolation and resource budgets

Run the service in a dedicated non-root sandbox/container, apart from the portal
and gameplay processes. Restrict ingress, egress to Supabase/R2/Queues, disk and
CPU/memory at the OS level. The parser runs in a child process with cleared env,
Node permission restrictions to its private scratch directory, 384 MiB JS heap and
wall timeout. It receives no network/DB/storage credential. Node permissions are
defense in depth, **not** a replacement for an OS sandbox against a parser exploit.
No hosting for third-party game servers is implemented.

The service spools the ZIP and extracted files to private disk, with fixed-size
reads/writes and no full archive/file buffering. Default policy: 500 MiB archive,
16 GiB extracted, 4 GiB/file, 50k entries, depth 32, ratio 200, 15 min parsing,
one hour total job, three attempts, two concurrent uploads/account, 20/day.
Provision at least archive + extracted + overhead disk per active job (24 GiB for
the defaults). Size quotas are enforced while reading/decompressing; infrastructure
must also enforce a hard disk/RSS/CPU cap. Load-test the chosen host before enabling
the portal flag. These defaults are a policy, not a claim that every Unity/Godot
project fits; edit the centralized policy for future sessions when capacity changes.

Files are stored under generated ordinal spool names, never ZIP filenames.
Original client archive and extracted content are preserved in private final R2.
An inventory is written last, before a single DB transaction inserts a draft
version and completes its upload. A crash replays the same conditional writes;
matching hash/size is required before reusing any object. A different logical
upload uses a different version UUID even for identical content.

## Cleanup and operational prerequisites

Terminal jobs wait one day before cleanup. Completed versions keep final content;
failed/expired jobs remove only their unique final prefix and staging object/MPU.
Cleanup is retry-safe and marks the DB row only after deletions succeed.
Configure an R2 lifecycle to abort incomplete multipart uploads after 1 day: this
covers a crash between R2 creation and attachment to the DB. Never apply a blanket
staging object TTL shorter than the maximum queue/retry window. Add monitoring for
stuck finalizing/queued/validating sessions, DLQ backlog and GC failures.

Migration and feature-flag state must be verified on the target environment.
The preview resolver/player belongs to GAME-DISTRIBUTION-3 and must authorize a
validated version; it must never return a staging URL.
