import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const backupCreate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    backup: { create: backupCreate },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const BASE_URL = 'http://localhost/api/routes-d/admin/backups/restore'

function makeRequest(body: Record<string, unknown>, auth: string = 'Bearer token') {
  const headers: Record<string, string> = { authorization: auth }
  if (body && Object.keys(body).length > 0) {
    headers['content-type'] = 'application/json'
  }
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/routes-d/admin/backups/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backupCreate.mockResolvedValue({
      id: 'restore_1',
      type: 'restore',
      label: 'Restore: full',
      status: 'queued',
      createdAt: new Date('2026-07-27'),
    })
  })

  it('returns 401 when no auth token is provided', async () => {
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({}, ''))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 for an invalid token', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({ backupId: 'b_1' }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when token is valid but user not found', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue(null as any)
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({ backupId: 'b_1' }))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 when user is not admin', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'freelancer' })
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({ backupId: 'b_1' }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden: admin access required' })
  })

  it('triggers a full restore by default', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    backupCreate.mockResolvedValue({
      id: 'restore_1',
      type: 'restore',
      label: 'Restore: full',
      status: 'queued',
      createdAt: new Date('2026-07-27'),
    })
    
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({}))
    
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json.restoreJob).toBeDefined()
    expect(json.restoreJob.type).toBe('restore')
    expect(json.restoreJob.label).toContain('Restore: full')
  })

  it('accepts partial restore type', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    backupCreate.mockResolvedValue({
      id: 'restore_2',
      type: 'restore',
      label: 'Restore: partial',
      status: 'queued',
      createdAt: new Date('2026-07-27'),
    })
    
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({ restoreType: 'partial' }))
    
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json.restoreJob.label).toContain('Restore: partial')
  })

  it('accepts backupId reference', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    backupCreate.mockResolvedValue({
      id: 'restore_3',
      type: 'restore',
      label: 'Restore: full from bkp_123',
      status: 'queued',
      createdAt: new Date('2026-07-27'),
    })
    
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({ backupId: 'bkp_123' }))
    
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json.restoreJob.label).toContain('from bkp_123')
  })

  it('ignores invalid restore type', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    backupCreate.mockResolvedValue({
      id: 'restore_4',
      type: 'restore',
      label: 'Restore: full',
      status: 'queued',
      createdAt: new Date('2026-07-27'),
    })
    
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({ restoreType: 'invalid' }))
    
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json.restoreJob.label).toContain('Restore: full')
  })

  it('returns 500 on database error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    backupCreate.mockRejectedValue(new Error('db down'))
    
    const { POST } = await import('@/app/api/routes-d/admin/backups/restore/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to trigger restore' })
  })
})