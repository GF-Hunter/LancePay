import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userSession: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GET } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)
const userDelegate = prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
const sessionDelegate = prisma.userSession as unknown as { findMany: ReturnType<typeof vi.fn> }

const BASE_URL = 'http://localhost/api/routes-d/auth/suspicious-activity'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return new NextRequest(`${BASE_URL}${query}`, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

function authAsUser() {
  mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
  userDelegate.findUnique.mockResolvedValue({ id: 'user-1' })
}

// First findMany call returns window sessions, second returns pre-window agents.
function seedSessions(windowSessions: unknown[], knownAgents: unknown[] = []) {
  sessionDelegate.findMany
    .mockResolvedValueOnce(windowSessions)
    .mockResolvedValueOnce(knownAgents)
}

function session(overrides: Record<string, unknown>) {
  return {
    id: 'session-1',
    deviceLabel: 'MacBook',
    userAgent: 'Mozilla/5.0 (Macintosh)',
    ipAddress: '203.0.113.1',
    issuedAt: new Date('2026-07-20T10:00:00Z'),
    revokedAt: null,
    ...overrides,
  }
}

describe('GET /api/routes-d/auth/suspicious-activity', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user does not exist', async () => {
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
    userDelegate.findUnique.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(404)
  })

  it('returns an empty log for a quiet account', async () => {
    authAsUser()
    seedSessions(
      [session({ userAgent: 'Mozilla/5.0 (Macintosh)' })],
      [{ userAgent: 'Mozilla/5.0 (Macintosh)' }] // device already known
    )

    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toEqual([])
    expect(body.total).toBe(0)
    expect(body.window_days).toBe(30)
  })

  it('flags revoked sessions', async () => {
    authAsUser()
    seedSessions(
      [
        session({
          id: 'session-r',
          userAgent: null,
          revokedAt: new Date('2026-07-21T09:00:00Z'),
        }),
      ],
      []
    )

    const body = await (await GET(makeGet())).json()
    expect(body.events).toHaveLength(1)
    expect(body.events[0]).toMatchObject({
      session_id: 'session-r',
      type: 'revoked_session',
      detected_at: '2026-07-21T09:00:00.000Z',
    })
  })

  it('flags first-time devices but not known ones', async () => {
    authAsUser()
    seedSessions(
      [
        session({ id: 'session-known', userAgent: 'KnownAgent/1.0' }),
        session({ id: 'session-new', userAgent: 'BrandNewAgent/9.9' }),
      ],
      [{ userAgent: 'KnownAgent/1.0' }]
    )

    const body = await (await GET(makeGet())).json()
    expect(body.events).toHaveLength(1)
    expect(body.events[0]).toMatchObject({ session_id: 'session-new', type: 'new_device' })
  })

  it('does not flag the same new device twice in a window', async () => {
    authAsUser()
    seedSessions(
      [
        session({ id: 'session-a', userAgent: 'FreshAgent/1.0' }),
        session({ id: 'session-b', userAgent: 'FreshAgent/1.0' }),
      ],
      []
    )

    const body = await (await GET(makeGet())).json()
    const newDevice = body.events.filter((e: { type: string }) => e.type === 'new_device')
    expect(newDevice).toHaveLength(1)
    expect(newDevice[0].session_id).toBe('session-a')
  })

  it('flags every session when more than two distinct IPs appear', async () => {
    authAsUser()
    seedSessions(
      [
        session({ id: 's1', userAgent: null, ipAddress: '203.0.113.1' }),
        session({ id: 's2', userAgent: null, ipAddress: '203.0.113.2' }),
        session({ id: 's3', userAgent: null, ipAddress: '203.0.113.3' }),
      ],
      []
    )

    const body = await (await GET(makeGet())).json()
    const multiIp = body.events.filter((e: { type: string }) => e.type === 'multiple_ips')
    expect(multiIp).toHaveLength(3)
  })

  it('sorts events newest first and applies the limit', async () => {
    authAsUser()
    seedSessions(
      [
        session({
          id: 'older',
          userAgent: 'AgentA/1.0',
          issuedAt: new Date('2026-07-10T10:00:00Z'),
        }),
        session({
          id: 'newer',
          userAgent: 'AgentB/1.0',
          issuedAt: new Date('2026-07-20T10:00:00Z'),
        }),
      ],
      []
    )

    const body = await (await GET(makeGet('?limit=1'))).json()
    expect(body.total).toBe(2)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].session_id).toBe('newer')
  })

  it('rejects invalid days and limit values', async () => {
    authAsUser()
    expect((await GET(makeGet('?days=0'))).status).toBe(400)
    expect((await GET(makeGet('?days=91'))).status).toBe(400)
    expect((await GET(makeGet('?limit=0'))).status).toBe(400)
    expect((await GET(makeGet('?limit=201'))).status).toBe(400)
  })

  it('returns 500 when the session query fails', async () => {
    authAsUser()
    sessionDelegate.findMany.mockRejectedValue(new Error('db down'))
    const res = await GET(makeGet())
    expect(res.status).toBe(500)
  })
})
