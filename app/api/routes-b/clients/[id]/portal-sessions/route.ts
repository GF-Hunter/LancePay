import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAuthToken } from "@/lib/auth";
import { generateToken, hashToken } from "@/lib/crypto";
import { logger } from "@/lib/logger";

// GET  /api/routes-b/clients/[id]/portal-sessions — list a client's portal sessions.
// POST /api/routes-b/clients/[id]/portal-sessions — issue a new portal session,
//                                                    or revoke an existing one.
//
// Scoped to clients (User rows with role="client") that have at least one
// invoice from the authenticated freelancer. Session tokens are stored as a
// SHA-256 hash only (mirrors ApiKey/InvoicePublicLink); the plaintext token
// is returned exactly once, at issuance, and never stored or logged.
//
// GET query params (all optional):
//   page  — 1-based page number (default: 1)
//   limit — page size 1–100 (default: 25)
//
// POST body:
//   { action: "revoke", sessionId: string }   — revoke an existing session
//   { expiresInSeconds?: number }             — issue a new session (default action)

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 90; // 90 days

interface PortalSessionRequestBody {
  action?: unknown;
  sessionId?: unknown;
  expiresInSeconds?: unknown;
}

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!authToken) return null;
  const claims = await verifyAuthToken(authToken);
  if (!claims) return null;
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } });
}

function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseExpiresInSeconds(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error("expiresInSeconds must be a positive number");
  }
  if (raw > MAX_EXPIRES_IN_SECONDS) {
    throw new Error(`expiresInSeconds must be ${MAX_EXPIRES_IN_SECONDS} or fewer`);
  }
  return Math.floor(raw);
}

// A "client" of the authenticated user is a User with role="client" that has
// at least one invoice billed by that user (mirrors the ownership check used
// by the existing clients/[id]/activity and credit-limit routes).
async function findOwnedClient(clientId: string, userId: string) {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "client" },
    select: { id: true },
  });
  if (!client) return null;

  const hasInvoiceRelationship = await prisma.invoice.findFirst({
    where: { clientId, userId },
    select: { id: true },
  });
  if (!hasInvoiceRelationship) return null;

  return client;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!clientId || !clientId.trim()) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const client = await findOwnedClient(clientId, user.id);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));

    const where = { userId: user.id, clientId };

    const [sessions, total] = await Promise.all([
      prisma.clientPortalSession.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          tokenHint: true,
          lastSeenAt: true,
          revokedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.clientPortalSession.count({ where }),
    ]);

    return NextResponse.json({
      sessions: sessions.map((session) => ({
        ...session,
        lastSeenAt: session.lastSeenAt ? session.lastSeenAt.toISOString() : null,
        revokedAt: session.revokedAt ? session.revokedAt.toISOString() : null,
        expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
        createdAt: session.createdAt.toISOString(),
        status: session.revokedAt
          ? "revoked"
          : session.expiresAt && session.expiresAt.getTime() <= Date.now()
            ? "expired"
            : "active",
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "GET /api/routes-b/clients/[id]/portal-sessions error");
    return NextResponse.json({ error: "Failed to fetch portal sessions" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!clientId || !clientId.trim()) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const client = await findOwnedClient(clientId, user.id);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    let body: PortalSessionRequestBody = {};
    try {
      body = (await request.json()) as PortalSessionRequestBody;
    } catch {
      body = {};
    }

    if (body.action === "revoke") {
      const { sessionId } = body;
      if (typeof sessionId !== "string" || !sessionId.trim()) {
        return NextResponse.json(
          { error: "sessionId is required to revoke a portal session" },
          { status: 400 },
        );
      }

      const session = await prisma.clientPortalSession.findFirst({
        where: { id: sessionId, userId: user.id, clientId },
      });
      if (!session) {
        return NextResponse.json({ error: "Portal session not found" }, { status: 404 });
      }

      if (session.revokedAt) {
        return NextResponse.json({
          session: { id: session.id, revokedAt: session.revokedAt.toISOString() },
        });
      }

      const revoked = await prisma.clientPortalSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
        select: { id: true, revokedAt: true },
      });

      return NextResponse.json({
        session: { id: revoked.id, revokedAt: revoked.revokedAt!.toISOString() },
      });
    }

    if (body.action !== undefined && body.action !== "issue") {
      return NextResponse.json(
        { error: 'action must be "issue" or "revoke" when provided' },
        { status: 400 },
      );
    }

    let expiresInSeconds: number | null;
    try {
      expiresInSeconds = parseExpiresInSeconds(body.expiresInSeconds);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }

    const token = generateToken();
    const hashedToken = hashToken(token);
    const tokenHint = token.slice(-8);
    const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;

    const session = await prisma.clientPortalSession.create({
      data: {
        userId: user.id,
        clientId,
        hashedToken,
        tokenHint,
        expiresAt,
      },
      select: {
        id: true,
        tokenHint: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        session: {
          id: session.id,
          token,
          tokenHint: session.tokenHint,
          expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
          createdAt: session.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ err: error }, "POST /api/routes-b/clients/[id]/portal-sessions error");
    return NextResponse.json({ error: "Failed to process portal session request" }, { status: 500 });
  }
}
