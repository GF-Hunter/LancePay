import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    automation: { findFirst: vi.fn() },
    automationRun: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockAutomationFindFirst = prisma.automation.findFirst as unknown as ReturnType<typeof vi.fn>
const mockRunFindMany = prisma.automationRun.findMany as unknown as ReturnType<typeof vi.fn>
const mockRunCount = prisma.automationRun.count as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/automations/auto-1/runs'
const params = { id: 'auto-1' }

function makeReq(query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockAutomationFindFirst.mockResolvedValue({ id: 'auto-1' })
  mockRunFindMany.mockResolvedValue([
    { id: 'run-1', status: 'success', message: null, startedAt: new Date(), finishedAt: new Date() },
  ])
  mockRunCount.mockResolvedValue(1)
})

describe('GET /api/routes-b/automations/[id]/runs', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq('', null), { params })
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the automation does not exist or belongs to another user', async () => {
    mockAutomationFindFirst.mockResolvedValue(null)
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 200 with paginated runs on the happy path', async () => {
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.runs).toHaveLength(1)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the automation (ownership already verified)', async () => {
    await GET(makeReq(), { params })
    expect(mockRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { automationId: 'auto-1' } }),
    )
  })

  it('clamps limit to the maximum allowed', async () => {
    const res = await GET(makeReq('?limit=9999'), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.limit).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockRunFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeReq(), { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch automation runs')
  })
})
