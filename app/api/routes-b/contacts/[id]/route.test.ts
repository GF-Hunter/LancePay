import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, PATCH } from './route'
import { NextRequest } from 'next/server'
import * as authLib from '@/lib/auth'
import * as db from '@/lib/db'
import * as loggerLib from '@/lib/logger'

vi.mock('@/lib/auth')
vi.mock('@/lib/db')
vi.mock('@/lib/logger')

describe('GET /api/routes-b/contacts/[id]', () => {
  const mockUserId = 'user-123'
  const mockPrivyId = 'privy-123'
  const mockContactId = 'contact-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when no auth token provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123')
    const response = await GET(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 when contact not found', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Contact not found')
  })

  it('should return contact details for authenticated user', async () => {
    const mockContact = {
      id: mockContactId,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Acme Corp',
      notes: 'Primary contact',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue(mockContact)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.contact).toEqual(mockContact)
  })

  it('should exclude soft-deleted contacts', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    await GET(request, { params: { id: mockContactId } })

    const findFirstCall = vi.mocked(db.prisma.contact.findFirst).mock.calls[0][0]
    expect(findFirstCall.where).toEqual({
      id: mockContactId,
      userId: mockUserId,
      deletedAt: null,
    })
  })

  it('should return 500 on database error', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockRejectedValue(
      new Error('Database connection failed')
    )

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await GET(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to fetch contact')
  })
})

describe('PATCH /api/routes-b/contacts/[id]', () => {
  const mockUserId = 'user-123'
  const mockPrivyId = 'privy-123'
  const mockContactId = 'contact-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when no auth token provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jane Doe' }),
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 400 for invalid JSON', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: 'invalid json',
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid JSON body')
  })

  it('should return 404 when contact not found', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jane Doe' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Contact not found')
  })

  it('should return 400 when name is empty', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ name: '   ' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('name cannot be empty')
  })

  it('should return 400 when email is invalid', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ email: 'invalid-email' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('email must be a valid email address')
  })

  it('should return 400 when name exceeds max length', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'a'.repeat(300) }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('name must be at most')
  })

  it('should return 400 when no fields to update', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('No fields to update')
  })

  it('should update contact with valid data', async () => {
    const mockUpdatedContact = {
      id: mockContactId,
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+9876543210',
      company: 'Tech Corp',
      notes: 'Updated notes',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)
    vi.mocked(db.prisma.contact.update).mockResolvedValue(mockUpdatedContact)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+9876543210',
        company: 'Tech Corp',
        notes: 'Updated notes',
      }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.contact).toEqual(mockUpdatedContact)
  })

  it('should allow partial updates', async () => {
    const mockUpdatedContact = {
      id: mockContactId,
      name: 'Jane Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Acme Corp',
      notes: 'Primary contact',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)
    vi.mocked(db.prisma.contact.update).mockResolvedValue(mockUpdatedContact)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jane Doe' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.contact.name).toBe('Jane Doe')
  })

  it('should normalize email to lowercase', async () => {
    const mockUpdatedContact = {
      id: mockContactId,
      name: 'John Doe',
      email: 'john@example.com',
      phone: null,
      company: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)
    vi.mocked(db.prisma.contact.update).mockResolvedValue(mockUpdatedContact)

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ email: 'JOHN@EXAMPLE.COM' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })

    const updateCall = vi.mocked(db.prisma.contact.update).mock.calls[0][0]
    expect(updateCall.data.email).toBe('john@example.com')
  })

  it('should return 500 on database error', async () => {
    vi.mocked(authLib.verifyAuthToken).mockResolvedValue({
      userId: mockPrivyId,
    } as any)
    vi.mocked(db.prisma.user.findUnique).mockResolvedValue({
      id: mockUserId,
    } as any)
    vi.mocked(db.prisma.contact.findFirst).mockResolvedValue({
      id: mockContactId,
    } as any)
    vi.mocked(db.prisma.contact.update).mockRejectedValue(
      new Error('Database connection failed')
    )

    const request = new NextRequest('http://localhost:3000/api/routes-b/contacts/contact-123', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jane Doe' }),
      headers: { Authorization: 'Bearer valid-token' },
    })
    const response = await PATCH(request, { params: { id: mockContactId } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to update contact')
  })
})
