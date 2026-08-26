import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({ verifyAuthToken: vi.fn() }));
vi.mock("@/lib/crypto", () => ({
  generateToken: vi.fn(() => "b".repeat(56) + "87654321"),
  hashToken: vi.fn((token: string) => `hashed:${token}`),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    invoice: { findFirst: vi.fn() },
    clientPortalSession: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { verifyAuthToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

const params = Promise.resolve({ id: "client-1" });
const user = { id: "user-1" };
const client = { id: "client-1" };
const invoiceRelationship = { id: "inv-1" };

const sessions = [
  {
    id: "sess-2",
    tokenHint: "87654321",
    lastSeenAt: null,
    revokedAt: null,
    expiresAt: null,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
  },
  {
    id: "sess-1",
    tokenHint: "11112222",
    lastSeenAt: new Date("2026-08-01T12:00:00.000Z"),
    revokedAt: new Date("2026-08-01T13:00:00.000Z"),
    expiresAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
];

function makeGetRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/routes-b/clients/client-1/portal-sessions${query}`,
    { headers: { authorization: "Bearer token" } },
  );
}

function makePostRequest(body: unknown = {}) {
  return new NextRequest("http://localhost/api/routes-b/clients/client-1/portal-sessions", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: "privy-1" } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(client as never);
  vi.mocked(prisma.invoice.findFirst).mockResolvedValue(invoiceRelationship as never);
  vi.mocked(prisma.clientPortalSession.findMany).mockResolvedValue(sessions as never);
  vi.mocked(prisma.clientPortalSession.count).mockResolvedValue(sessions.length as never);
  vi.mocked(prisma.clientPortalSession.create).mockResolvedValue({
    id: "sess-3",
    tokenHint: "87654321",
    expiresAt: null,
    createdAt: new Date("2026-08-03T00:00:00.000Z"),
  } as never);
});

describe("GET /api/routes-b/clients/[id]/portal-sessions", () => {
  it("lists portal sessions for an owned client with a derived status", async () => {
    const res = await GET(makeGetRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].status).toBe("active");
    expect(body.sessions[1].status).toBe("revoked");
    expect(prisma.clientPortalSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", clientId: "client-1" } }),
    );
  });

  it("marks a session with a past expiresAt as expired", async () => {
    vi.mocked(prisma.clientPortalSession.findMany).mockResolvedValue([
      {
        id: "sess-4",
        tokenHint: "00000000",
        lastSeenAt: null,
        revokedAt: null,
        expiresAt: new Date("2000-01-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ] as never);
    vi.mocked(prisma.clientPortalSession.count).mockResolvedValue(1 as never);

    const res = await GET(makeGetRequest(), { params });
    const body = await res.json();
    expect(body.sessions[0].status).toBe("expired");
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/routes-b/clients/client-1/portal-sessions"),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the target user is not a client", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the client has no invoice relationship with the authenticated user", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(404);
  });

  it("clamps limit to the maximum allowed page size", async () => {
    await GET(makeGetRequest("?limit=999"), { params });
    expect(prisma.clientPortalSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});

describe("POST /api/routes-b/clients/[id]/portal-sessions (issue)", () => {
  it("issues a new portal session and returns the plaintext token once", async () => {
    const res = await POST(makePostRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.session.token).toBe("b".repeat(56) + "87654321");
    expect(body.session.tokenHint).toBe("87654321");
    expect(prisma.clientPortalSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", clientId: "client-1" }),
      }),
    );
  });

  it("accepts an explicit issue action", async () => {
    const res = await POST(makePostRequest({ action: "issue" }), { params });
    expect(res.status).toBe(201);
  });

  it("accepts an expiresInSeconds option", async () => {
    const expiring = {
      id: "sess-5",
      tokenHint: "87654321",
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
    };
    vi.mocked(prisma.clientPortalSession.create).mockResolvedValue(expiring as never);

    const res = await POST(makePostRequest({ expiresInSeconds: 3600 }), { params });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.session.expiresAt).toBe("2026-08-10T00:00:00.000Z");
  });

  it("returns 400 for a non-positive expiresInSeconds", async () => {
    const res = await POST(makePostRequest({ expiresInSeconds: 0 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when expiresInSeconds exceeds the maximum window", async () => {
    const res = await POST(makePostRequest({ expiresInSeconds: 60 * 60 * 24 * 365 }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown action", async () => {
    const res = await POST(makePostRequest({ action: "delete" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/routes-b/clients/client-1/portal-sessions", {
        method: "POST",
      }),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the client is not owned by the user", async () => {
    vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);
    const res = await POST(makePostRequest(), { params });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/routes-b/clients/[id]/portal-sessions (revoke)", () => {
  it("revokes an existing active session", async () => {
    vi.mocked(prisma.clientPortalSession.findFirst).mockResolvedValue({
      id: "sess-1",
      userId: "user-1",
      clientId: "client-1",
      revokedAt: null,
    } as never);
    vi.mocked(prisma.clientPortalSession.update).mockResolvedValue({
      id: "sess-1",
      revokedAt: new Date("2026-08-03T00:00:00.000Z"),
    } as never);

    const res = await POST(makePostRequest({ action: "revoke", sessionId: "sess-1" }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.session.revokedAt).toBe("2026-08-03T00:00:00.000Z");
    expect(prisma.clientPortalSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sess-1" }, data: { revokedAt: expect.any(Date) } }),
    );
  });

  it("is idempotent when the session is already revoked", async () => {
    const revokedAt = new Date("2026-08-01T00:00:00.000Z");
    vi.mocked(prisma.clientPortalSession.findFirst).mockResolvedValue({
      id: "sess-1",
      userId: "user-1",
      clientId: "client-1",
      revokedAt,
    } as never);

    const res = await POST(makePostRequest({ action: "revoke", sessionId: "sess-1" }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.session.revokedAt).toBe(revokedAt.toISOString());
    expect(prisma.clientPortalSession.update).not.toHaveBeenCalled();
  });

  it("returns 400 when sessionId is missing", async () => {
    const res = await POST(makePostRequest({ action: "revoke" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session does not exist or belongs to a different client/owner", async () => {
    vi.mocked(prisma.clientPortalSession.findFirst).mockResolvedValue(null);
    const res = await POST(makePostRequest({ action: "revoke", sessionId: "sess-x" }), { params });
    expect(res.status).toBe(404);
  });
});

describe("error handling", () => {
  it("returns 500 and logs when GET hits a database error", async () => {
    vi.mocked(prisma.clientPortalSession.findMany).mockRejectedValue(new Error("db down"));
    const res = await GET(makeGetRequest(), { params });
    expect(res.status).toBe(500);
  });

  it("returns 500 and logs when POST hits a database error", async () => {
    vi.mocked(prisma.clientPortalSession.create).mockRejectedValue(new Error("db down"));
    const res = await POST(makePostRequest(), { params });
    expect(res.status).toBe(500);
  });
});
