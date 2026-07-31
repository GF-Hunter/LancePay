# Admin & System routes-d Endpoints

Reference documentation for the admin/system-level `routes-d` endpoints: webhook
observability, runtime log-level control, and job cancellation. All four require
a valid Bearer token (`Authorization: Bearer <token>`) resolved via
`verifyAuthToken`, and (except job cancel) require the caller's `role` to be
`admin`.

## GET /api/routes-d/admin/webhooks/debugger

Admin-only. Returns recent webhook delivery records, each including its parent
webhook's `targetUrl` and `eventTypes`.

**Query params**

- `webhookId` (optional) — filter deliveries to a single webhook.
- `limit` (optional, default `20`, capped at `100`).

**Response `200`**

```json
{
  "deliveries": [
    {
      "id": "...",
      "webhook": { "targetUrl": "...", "eventTypes": ["..."] },
      "...": "..."
    }
  ],
  "count": 20,
  "filters": { "webhookId": null, "limit": 20 }
}
```

**Errors**: `401` missing/invalid token, `403` non-admin, `404` user not found, `500` unexpected.

## PATCH /api/routes-d/admin/webhooks/sink-rewrite

Admin-only. Rewrites a webhook's `targetUrl` — used to redirect webhook
delivery to a staging endpoint without deleting/recreating the webhook.

**Body**

```json
{ "webhookId": "wh_123", "newTargetUrl": "https://staging.example.com/hooks" }
```

`newTargetUrl` must parse as a valid URL with an `http`/`https` protocol.

**Response `200`**

```json
{
  "webhook": {
    "id": "wh_123",
    "targetUrl": "https://staging.example.com/hooks",
    "updatedAt": "..."
  },
  "previousUrl": "https://old.example.com/hooks",
  "rewrittenBy": "admin@example.com",
  "rewrittenAt": "2026-07-27T00:00:00.000Z"
}
```

**Errors**: `400` missing/invalid `webhookId`/`newTargetUrl` or non-http(s) protocol, `401`, `403`, `404` webhook not found, `500`.

## PATCH /api/routes-d/system/log-level

Admin-only. Changes the in-process log level at runtime. State is
module-level (intentionally session-scoped — a process restart resets to
`info`; it does not persist to a database).

**Body**

```json
{ "level": "debug" }
```

Valid levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

**Response `200`**

```json
{
  "previousLevel": "info",
  "currentLevel": "debug",
  "changedBy": "admin@example.com",
  "changedAt": "2026-07-27T00:00:00.000Z"
}
```

**Errors**: `400` missing/invalid `level` (response includes `validLevels`), `401`, `403`, `404`, `500`.

## POST /api/routes-d/jobs/[id]/cancel

Cancels a job by ID. A user may cancel their own jobs; an `admin` may cancel
any job.

**Cancellable statuses**: `pending`, `queued`, `scheduled`. Jobs in any other
status (e.g. `running`, `completed`, `failed`) cannot be cancelled.

**Response `200`**

```json
{
  "job": {
    "id": "job_123",
    "type": "...",
    "status": "cancelled",
    "cancelledAt": "..."
  }
}
```

**Errors**:

- `400` missing job ID
- `401` missing/invalid token
- `403` caller does not own the job and is not an admin
- `404` job not found
- `409` job is not in a cancellable status — response includes `cancellableStatuses`
- `500` unexpected
