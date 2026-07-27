import { NextRequest } from 'next/server'
import { POST } from './route'

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    invoice: { findFirst: jest.fn() },
    invoiceCollaborator: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ verifyAuthToken: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as jest.Mock
const db = prisma as unknown as {
  invoice: { findFirst: jest.Mock }
  invoiceCollaborator: { findMany: jest.Mock }
  notification: { createMany: jest.Mock }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1' })
  db.invoice.findFirst.mockResolvedValue({ id: 'inv-1', ownerId: 'user-1' })
  db.invoiceCollaborator.findMany.mockResolvedValue([{ userId: 'collab-1' }, { userId: 'collab-2' }])
  db.notification.createMany.mockResolvedValue({ count: 2 })
})

function makeReq(id: string, body: unknown = {}) {
  return new NextRequest(`http://localhost/api/routes-b/invoices/${id}/collaborators/notify`, {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('POST 401 when unauthenticated', async () => {
  mockVerify.mockResolvedValue(null)
  const res = await POST(makeReq('inv-1'), { params: { id: 'inv-1' } })
  expect(res.status).toBe(401)
})

test('POST 404 invoice not found or not owned', async () => {
  db.invoice.findFirst.mockResolvedValue(null)
  const res = await POST(makeReq('no-inv'), { params: { id: 'no-inv' } })
  expect(res.status).toBe(404)
})

test('POST 200 zero collaborators returns notified: 0', async () => {
  db.invoiceCollaborator.findMany.mockResolvedValue([])
  const res = await POST(makeReq('inv-1'), { params: { id: 'inv-1' } })
  expect(res.status).toBe(200)
  expect((await res.json()).notified).toBe(0)
})

test('POST 200 notifies all collaborators', async () => {
  const res = await POST(makeReq('inv-1', { message: 'Please review' }), { params: { id: 'inv-1' } })
  expect(res.status).toBe(200)
  expect((await res.json()).notified).toBe(2)
  expect(db.notification.createMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ type: 'invoice_collaborator_notification' })]) }),
  )
})
