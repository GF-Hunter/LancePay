import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    clientFileDrop: { findFirst: vi.fn() },
    clientFileDropItem: { findMany: vi.fn(), createMany: vi.fn() },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'

const mockDrop = { id: 'drop-1', status: 'active', expiresAt: null }
const params = Promise.resolve({ token: 'tok-1' })

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/client-file-drop/tok-1', {
    method: 'GET',
  })
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/client-file-drop/tok-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.clientFileDrop.findFirst).mockResolvedValue(mockDrop as never)
  vi.mocked(prisma.clientFileDropItem.findMany).mockResolvedValue([
    { id: 'file-1', fileName: 'invoice.pdf', fileUrl: 'https://cdn.example.com/invoice.pdf', sizeBytes: 1024, createdAt: new Date() },
  ] as never)
  vi.mocked(prisma.clientFileDropItem.createMany).mockResolvedValue({ count: 1 })
})

describe('GET /api/routes-b/client-file-drop/[token]', () => {
  it('lists files for a valid, active drop token', async () => {
    const res = await GET(makeGet(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.dropId).toBe('drop-1')
    expect(data.files).toHaveLength(1)
  })

  it('returns 404 for an unknown token', async () => {
    vi.mocked(prisma.clientFileDrop.findFirst).mockResolvedValue(null)
    const res = await GET(makeGet(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 404 for an expired drop', async () => {
    vi.mocked(prisma.clientFileDrop.findFirst).mockResolvedValue({
      ...mockDrop,
      expiresAt: new Date(Date.now() - 60_000),
    } as never)
    const res = await GET(makeGet(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when token is blank', async () => {
    const res = await GET(makeGet(), { params: Promise.resolve({ token: ' ' }) })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/routes-b/client-file-drop[token]', () => {
  it('accepts files for a valid drop', async () => {
    const res = await POST(
      makePost({ files: [{ fileName: 'a.pdf', fileUrl: 'https://cdn.example.com/a.pdf', sizeBytes: 10 }] }),
      { params },
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.filesAdded).toBe(1)
  })

  it('returns 404 for an unknown token', async () => {
    vi.mocked(prisma.clientFileDrop.findFirst).mockResolvedValue(null)
    const res = await POST(makePost({ files: [{ fileName: 'a.pdf', fileUrl: 'https://x/a.pdf' }] }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no files are provided', async () => {
    const res = await POST(makePost({ files: [] }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when too many files are provided', async () => {
    const res = await POST(
      makePost({ files: Array.from({ length: 11 }, (_, i) => ({ fileName: `f${i}`, fileUrl: `https://x/${i}` })) }),
      { params },
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when a file is missing fileUrl', async () => {
    const res = await POST(makePost({ files: [{ fileName: 'a.pdf' }] }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/client-file-drop/tok-1', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params })
    expect(res.status).toBe(400)
  })
})
