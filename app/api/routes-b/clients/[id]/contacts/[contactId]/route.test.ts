import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DELETE } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    client: { findFirst: vi.fn() },
    clientContact: { findFirst: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUserId = 'user-123'
const mockPrivyId = 'privy-123'
const mockClientId = 'client-123'
const mockContactId = 'contact-123'
const params = { id: mockClientId, contactId: mockContactId }

function makeRequest() {
  return new NextRequest(
    `http://localhost:3000/api/routes-b/clients/${mockClientId}/contacts/${mockContactId}`,
    { method: 'DELETE', headers: { Authorization: 'Bearer valid-token' } },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue({ userId: mockPrivyId } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: mockUserId } as never)
  vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: mockClientId, userId: mockUserId } as never)
  vi.mocked(prisma.clientContact.findFirst).mockResolvedValue({ id: mockContactId } as never)
  vi.mocked(prisma.clientContact.delete).mockResolvedValue({ id: mockContactId } as never)
})

describe('DELETE /api/routes-b/clients/[id]/contacts/[contactId]', () => {
  it('deletes the contact and returns 204', async () => {
    const res = await DELETE(makeRequest(), { params })
    expect(res.status).toBe(204)
    expect(prisma.clientContact.delete).toHaveBeenCalledWith({ where: { id: mockContactId } })
  })

  it('returns 401 when no auth token provided', async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/routes-b/clients/${mockClientId}/contacts/${mockContactId}`,
      { method: 'DELETE' },
    )
    const res = await DELETE(request, { params })
    const data = await res.json()
    expect(res.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 401 when the token is invalid', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue(null)
    const res = await DELETE(makeRequest(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user record cannot be found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await DELETE(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the client does not exist or belongs to another user', async () => {
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null)
    const res = await DELETE(makeRequest(), { params })
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.error).toBe('Client not found')
  })

  it('scopes the client lookup to the authenticated user (ownership check)', async () => {
    await DELETE(makeRequest(), { params })
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: mockClientId, userId: mockUserId },
    })
  })

  it('returns 404 when the contact does not exist under this client', async () => {
    vi.mocked(prisma.clientContact.findFirst).mockResolvedValue(null)
    const res = await DELETE(makeRequest(), { params })
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.error).toBe('Contact not found')
  })

  it('scopes the contact lookup to the target client (ownership check)', async () => {
    await DELETE(makeRequest(), { params })
    expect(prisma.clientContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: mockContactId, clientId: mockClientId } }),
    )
  })

  it('returns 500 on database error', async () => {
    vi.mocked(prisma.clientContact.delete).mockRejectedValue(new Error('Database connection failed'))
    const res = await DELETE(makeRequest(), { params })
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toBe('Failed to remove contact')
  })
})
