import { NextRequest } from 'next/server'
import { POST } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    backup: { create: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as { backup: { create: jest.Mock } }

function makeReq(body: unknown = {}) {
  return new NextRequest('http://localhost/api/routes-d/admin/backups/trigger', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const BACKUP_RESP = { id: 'bk-1', type: 'full', label: null, status: 'queued', createdAt: new Date() }

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'admin' })
  db.backup.create.mockResolvedValue(BACKUP_RESP)
})

test('POST 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await POST(makeReq())
  expect(res.status).toBe(401)
})

test('POST 403 when not admin', async () => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'user' })
  const res = await POST(makeReq())
  expect(res.status).toBe(403)
  expect((await res.json()).error).toMatch(/admin/)
})

test('POST 202 triggers backup with defaults', async () => {
  const res = await POST(makeReq())
  expect(res.status).toBe(202)
  const body = await res.json()
  expect(body.backup.status).toBe('queued')
  expect(db.backup.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ type: 'full', status: 'queued' }) }),
  )
})

test('POST 202 accepts incremental type', async () => {
  db.backup.create.mockResolvedValue({ ...BACKUP_RESP, type: 'incremental' })
  const res = await POST(makeReq({ type: 'incremental', label: 'nightly' }))
  expect(res.status).toBe(202)
  expect(db.backup.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ type: 'incremental' }) }),
  )
})
