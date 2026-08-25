import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    libraryAttachment: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockFindMany = prisma.libraryAttachment.findMany as unknown as ReturnType<typeof vi.fn>
const mockCount = prisma.libraryAttachment.count as unknown as ReturnType<typeof vi.fn>
const mockCreate = prisma.libraryAttachment.create as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/attachments/library'

function makeGet(query = '', token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

function makePost(body: unknown, token: string | null = 'Bearer valid-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const mockAttachment = {
  id: 'attach-1',
  fileName: 'invoice-template.pdf',
  fileUrl: 'https://example.com/files/invoice-template.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-1' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-1' })
  mockFindMany.mockResolvedValue([mockAttachment])
  mockCount.mockResolvedValue(1)
  mockCreate.mockResolvedValue(mockAttachment)
})

describe('GET /api/routes-b/attachments/library', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated attachments on the happy path', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.attachments).toHaveLength(1)
    expect(json.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 })
  })

  it('scopes the query to the authenticated user (ownership check)', async () => {
    await GET(makeGet())
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('clamps limit to the maximum allowed', async () => {
    const res = await GET(makeGet('?limit=9999'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.pagination.limit).toBe(100)
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockFindMany.mockRejectedValue(new Error('db unavailable'))
    const res = await GET(makeGet())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch library attachments')
  })
})

describe('POST /api/routes-b/attachments/library', () => {
  const validBody = {
    fileName: 'invoice-template.pdf',
    fileUrl: 'https://example.com/files/invoice-template.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await POST(makePost(validBody, null))
    expect(res.status).toBe(401)
  })

  it('returns 400 when the JSON body is invalid', async () => {
    const res = await POST(makePost('not-json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when fileName is missing', async () => {
    const res = await POST(makePost({ ...validBody, fileName: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when fileUrl is not a valid URL', async () => {
    const res = await POST(makePost({ ...validBody, fileUrl: 'not-a-url' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when mimeType is missing', async () => {
    const res = await POST(makePost({ ...validBody, mimeType: undefined }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when sizeBytes is not a positive number', async () => {
    const res = await POST(makePost({ ...validBody, sizeBytes: -5 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when sizeBytes exceeds the maximum allowed size', async () => {
    const res = await POST(makePost({ ...validBody, sizeBytes: 100 * 1024 * 1024 }))
    expect(res.status).toBe(400)
  })

  it('returns 201 and creates the attachment on the happy path', async () => {
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.attachment.fileName).toBe('invoice-template.pdf')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
    )
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockCreate.mockRejectedValue(new Error('db unavailable'))
    const res = await POST(makePost(validBody))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to upload library attachment')
  })
})
