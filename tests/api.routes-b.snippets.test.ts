import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const snippetFindMany = vi.fn()
const snippetCreate = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    snippet: { findMany: snippetFindMany, create: snippetCreate },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-b/snippets'

function req(token: string | null = 'tok', method = 'GET', body?: unknown) {
  const h = new Headers()
  if (token) h.set('authorization', `Bearer ${token}`)
  return new NextRequest(URL, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const SAMPLE_SNIPPETS = [
  { id: 'snip-1', title: 'Thank you', content: 'Thanks for your business!', createdAt: new Date(), updatedAt: new Date() },
]

describe('GET /api/routes-b/snippets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-b/snippets/route')
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns the user snippets', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    snippetFindMany.mockResolvedValue(SAMPLE_SNIPPETS)

    const { GET } = await import('@/app/api/routes-b/snippets/route')
    const res = await GET(req())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.snippets).toHaveLength(1)
    expect(json.snippets[0].title).toBe('Thank you')
  })
})

describe('POST /api/routes-b/snippets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-b/snippets/route')
    const res = await POST(req(null, 'POST', { title: 'x', content: 'y' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when title is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('@/app/api/routes-b/snippets/route')
    const res = await POST(req('tok', 'POST', { content: 'Some content' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/title/)
  })

  it('returns 400 when content is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('@/app/api/routes-b/snippets/route')
    const res = await POST(req('tok', 'POST', { title: 'A title' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/content/)
  })

  it('returns 400 when title exceeds max length', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    const { POST } = await import('@/app/api/routes-b/snippets/route')
    const res = await POST(req('tok', 'POST', { title: 'x'.repeat(151), content: 'y' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/150/)
  })

  it('creates a snippet', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'u1' })
    userFindUnique.mockResolvedValue({ id: 'user-1' })
    snippetCreate.mockResolvedValue({
      id: 'snip-2',
      title: 'Late fee notice',
      content: 'A late fee applies after the due date.',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { POST } = await import('@/app/api/routes-b/snippets/route')
    const res = await POST(
      req('tok', 'POST', { title: 'Late fee notice', content: 'A late fee applies after the due date.' }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.snippet.title).toBe('Late fee notice')
    expect(snippetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
    )
  })
})
