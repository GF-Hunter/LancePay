import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

const URL = 'http://localhost/api/routes-d/integrations/persona/callback'

function makeReq(body: unknown = {}, token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = token
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/routes-d/integrations/persona/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAuthToken.mockResolvedValue({ userId: 'privy-user-456' })
  })

  it('returns 401 when unauthenticated', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when body JSON is invalid', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq('invalid json'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when inquiryId is missing', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ eventType: 'inquiry.completed', status: 'completed' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('inquiryId is required')
  })

  it('returns 400 when eventType is unsupported', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ inquiryId: 'inq_123', eventType: 'unsupported.event', status: 'completed' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Unsupported event type/i)
  })

  it('returns 400 when status is missing', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ inquiryId: 'inq_123', eventType: 'inquiry.completed' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('status is required')
  })

  it('returns 200 with approved status on inquiry.completed', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ inquiryId: 'inq_123', eventType: 'inquiry.completed', status: 'completed' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.received).toBe(true)
    expect(json.inquiryId).toBe('inq_123')
    expect(json.kycStatus).toBe('approved')
    expect(json.processedAt).toBeDefined()
  })

  it('returns 200 with rejected status on inquiry.declined', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ inquiryId: 'inq_456', eventType: 'inquiry.declined', status: 'declined' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kycStatus).toBe('rejected')
  })

  it('returns 200 with pending status on inquiry.pending', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ inquiryId: 'inq_789', eventType: 'inquiry.pending', status: 'pending' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kycStatus).toBe('pending')
  })

  it('returns 200 with expired status on inquiry.expired', async () => {
    const { POST } = await import('@/app/api/routes-d/integrations/persona/callback/route')
    const res = await POST(makeReq({ inquiryId: 'inq_999', eventType: 'inquiry.expired', status: 'expired' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kycStatus).toBe('expired')
  })
})
