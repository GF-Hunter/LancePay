import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const transactionFindUnique = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError, info: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    transaction: { findUnique: transactionFindUnique },
  },
}))

const URL = 'http://localhost/api/routes-d/transactions/tx_1/tags'

function makeRequest(method = 'GET', body?: unknown, token: string | null = 'token') {
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new NextRequest(URL, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/routes-d/transactions/[id]/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when authorization header is missing', async () => {
    const { GET } = await import('@/app/api/routes-d/transactions/[id]/tags/route')
    const response = await GET(makeRequest('GET', undefined, null), {
      params: Promise.resolve({ id: 'tx_1' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when transaction is not found or unauthorized', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindUnique.mockResolvedValue(null)

    const { GET } = await import('@/app/api/routes-d/transactions/[id]/tags/route')
    const response = await GET(makeRequest('GET'), {
      params: Promise.resolve({ id: 'tx_999' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Transaction not found or unauthorized' })
  })

  it('returns 200 with transaction tags', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindUnique.mockResolvedValue({ id: 'tx_1', userId: 'user_1' })

    const { GET } = await import('@/app/api/routes-d/transactions/[id]/tags/route')
    const response = await GET(makeRequest('GET'), {
      params: Promise.resolve({ id: 'tx_1' }),
    })

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.id).toBe('tx_1')
    expect(Array.isArray(json.tags)).toBe(true)
  })
})

describe('POST /api/routes-d/transactions/[id]/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when tags input is missing', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindUnique.mockResolvedValue({ id: 'tx_1', userId: 'user_1' })

    const { POST } = await import('@/app/api/routes-d/transactions/[id]/tags/route')
    const response = await POST(makeRequest('POST', {}), {
      params: Promise.resolve({ id: 'tx_1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Tags are required' })
  })

  it('returns 200 on successfully adding tags', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    transactionFindUnique.mockResolvedValue({ id: 'tx_1', userId: 'user_1' })

    const { POST } = await import('@/app/api/routes-d/transactions/[id]/tags/route')
    const response = await POST(makeRequest('POST', { tags: ['urgent', 'tax-deductible'] }), {
      params: Promise.resolve({ id: 'tx_1' }),
    })

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.message).toBe('Tags added successfully')
    expect(json.tags).toEqual(['urgent', 'tax-deductible'])
  })
})
