import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    automation: { findFirst: vi.fn(), update: vi.fn() },
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

const BASE_URL = 'http://localhost/api/routes-b/automations/auto-1/toggle'
const params = { id: 'auto-1' }

function makeReq(body?: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockAutomationFindFirst.mockResolvedValue({ id: 'auto-1', isActive: true })
  mockAutomationUpdate.mockResolvedValue({ id: 'auto-1', isActive: false, updatedAt: new Date() })
})

describe('POST /api/routes-b/automations/[id]/toggle', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makeReq(undefined, null), { params })
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

  it('toggles the automation state when no body is provided', async () => {
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(200)
    expect(mockAutomationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    )
  })

  it('sets the automation to the explicit active value provided', async () => {
    mockAutomationUpdate.mockResolvedValue({ id: 'auto-1', isActive: true, updatedAt: new Date() })
    const res = await POST(makeReq({ active: true }), { params })
    expect(res.status).toBe(200)
    expect(mockAutomationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    )
  })

  it('returns 400 when active is not a boolean', async () => {
    const res = await POST(makeReq({ active: 'yes' }), { params })
    expect(res.status).toBe(400)
  })

  it('scopes the lookup to the authenticated user (ownership check)', async () => {
    await POST(makeReq(), { params })
    expect(mockAutomationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'auto-1', userId: 'user-1' } }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockAutomationUpdate.mockRejectedValue(new Error('db unavailable'))
    const res = await POST(makeReq(), { params })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to toggle automation')
  })
})
