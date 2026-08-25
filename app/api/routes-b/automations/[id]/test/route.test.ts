import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    automation: { findFirst: vi.fn(), update: vi.fn() },
    automationRun: { create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockAutomationFindFirst = prisma.automation.findFirst as unknown as ReturnType<typeof vi.fn>
const mockAutomationUpdate = prisma.automation.update as unknown as ReturnType<typeof vi.fn>
const mockRunCreate = prisma.automationRun.create as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/automations/auto-1/test'
const params = { id: 'auto-1' }

function makeReq(token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, { method: 'POST', headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockAutomationFindFirst.mockResolvedValue({ id: 'auto-1', actionType: 'send_email' })
  mockAutomationUpdate.mockResolvedValue({ id: 'auto-1' })
  mockRunCreate.mockResolvedValue({
    id: 'run-1',
    status: 'success',
    message: 'Test-fired send_email',
    startedAt: new Date(),
    finishedAt: new Date(),
  })
})

describe('POST /api/routes-b/automations/[id]/test', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makeReq(null), { params })
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the automation does not exist or belongs to another user', async () => {
    mockAutomationFindFirst.mockResolvedValue(null)
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(404)
  })

  it('creates a run record and returns 201 on the happy path', async () => {
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.run.id).toBe('run-1')
    expect(json.run.status).toBe('success')
    expect(mockRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ automationId: 'auto-1' }) }),
    )
  })

  it('scopes the lookup to the authenticated user (ownership check)', async () => {
    await POST(makeReq(), { params })
    expect(mockAutomationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'auto-1', userId: 'user-1' } }),
    )
  })

  it('updates lastRunAt on the automation', async () => {
    await POST(makeReq(), { params })
    expect(mockAutomationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'auto-1' } }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockRunCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to test-fire automation')
  })
})
