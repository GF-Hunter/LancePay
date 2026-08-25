import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    automation: { count: vi.fn() },
    automationRun: { groupBy: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockAutomationCount = prisma.automation.count as unknown as ReturnType<typeof vi.fn>
const mockRunGroupBy = prisma.automationRun.groupBy as unknown as ReturnType<typeof vi.fn>
const mockRunCount = prisma.automationRun.count as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/automations/stats'

function makeReq(token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockAutomationCount.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(where.isActive === true ? 3 : 5),
  )
  mockRunGroupBy.mockResolvedValue([
    { status: 'success', _count: { _all: 8 } },
    { status: 'failed', _count: { _all: 2 } },
  ])
  mockRunCount.mockResolvedValue(10)
})

describe('GET /api/routes-b/automations/stats', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 200 with aggregated stats on the happy path', async () => {
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      totalAutomations: 5,
      activeAutomations: 3,
      inactiveAutomations: 2,
      totalRuns: 10,
      runsByStatus: { success: 8, failed: 2 },
    })
  })

  it('scopes automation counts to the authenticated user', async () => {
    await GET(makeReq())
    expect(mockAutomationCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('returns zeroed stats when the user has no automations', async () => {
    mockAutomationCount.mockResolvedValue(0)
    mockRunGroupBy.mockResolvedValue([])
    mockRunCount.mockResolvedValue(0)
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totalAutomations).toBe(0)
    expect(json.runsByStatus).toEqual({})
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockRunGroupBy.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch automation stats')
  })
})
