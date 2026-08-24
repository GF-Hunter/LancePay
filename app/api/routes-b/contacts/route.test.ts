import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'
import * as authLib from '@/lib/auth'
import * as db from '@/lib/db'
import * as loggerLib from '@/lib/logger'

vi.mock('@/lib/auth')
vi.mock('@/lib/db')
vi.mock('@/lib/logger')

describe('GET /api/routes-b/contacts', () => {
  const mockUserId = 'user-123'
  const mockPrivyId = 'privy-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when no auth token provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 401 when token verification fails', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 401 when user not found', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return contacts for authenticated user', async () => {
    const mockContacts = [
      {
        id: 'contact-1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        company: 'Acme Corp',
        notes: 'Primary contact',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'contact-2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+0987654321',
        company: 'Tech Inc',
        notes: 'Technical lead',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findMany).mockResolvedValue(mockContacts)
    vi.mocked(db.prisma.contact.count).mockResolvedValue(2)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.contacts).toHaveLength(2)
    expect(data.contacts[0].name).toBe('John Doe')
    expect(data.contacts[1].name).toBe('Jane Smith')
    expect(data.total).toBe(2)
    expect(data.page).toBe(1)
    expect(data.limit).toBe(20)
  })

  it('should exclude deleted contacts', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findMany).mockResolvedValue([])
    vi.mocked(db.prisma.contact.count).mockResolvedValue(0)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    await GET(request)

    const findManyCall = vi.mocked(db.prisma.contact.findMany).mock.calls[0][0]
    expect(findManyCall.where).toEqual({
      userId: mockUserId,
      deletedAt: null,
    })
  })

  it('should support pagination with custom page and limit', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findMany).mockResolvedValue([])
    vi.mocked(db.prisma.contact.count).mockResolvedValue(50)

    const request = new NextRequest(
      'http://localhost:3000/api/routes-b/contacts?page=2&limit=10',
      { headers: { Authorization: 'Bearer valid-token' } }
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.page).toBe(2)
    expect(data.limit).toBe(10)

    const findManyCall = vi.mocked(db.prisma.contact.findMany).mock.calls[0][0]
    expect(findManyCall.skip).toBe(10)
    expect(findManyCall.take).toBe(10)
  })

  it('should cap limit at 100', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findMany).mockResolvedValue([])
    vi.mocked(db.prisma.contact.count).mockResolvedValue(0)

    const request = new NextRequest(
      'http://localhost:3000/api/routes-b/contacts?limit=500',
      { headers: { Authorization: 'Bearer valid-token' } }
    )
    const response = await GET(request)
    const data = await response.json()

    expect(data.limit).toBe(100)
  })

  it('should return 500 on database error', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findMany).mockRejectedValue(
      new Error('Database connection failed')
    )

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to fetch contacts')
  })
})
