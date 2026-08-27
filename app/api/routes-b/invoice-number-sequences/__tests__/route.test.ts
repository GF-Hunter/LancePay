import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('../../_lib/authz', () => ({
  requireScope: vi.fn(),
  RoutesBForbiddenError: class RoutesBForbiddenError extends Error {
    code = 'FORBIDDEN'
    status = 403
  },
}))
vi.mock('@/lib/db', () => ({
  prisma: {},
}))

import { requireScope, RoutesBForbiddenError } from '../../_lib/authz'
import { GET, PATCH } from '../route'

const mockedRequireScope = vi.mocked(requireScope)
const AUTH = { userId: 'user-1', role: 'freelancer', scopes: ['routes-b:read'] }
const BASE_URL = 'http://localhost/api/routes-b/invoice-number-sequences'

function makeGet(authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

function makePatch(body: unknown, authHeader: string | null = 'Bearer token') {
  return new NextRequest(BASE_URL, {
    method: 'PATCH',
    headers: authHeader
      ? { authorization: authHeader, 'content-type': 'application/json' }
      : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/routes-b/invoice-number-sequences', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(new RoutesBForbiddenError('missing'))
    const res = await GET(makeGet(null))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toBe('Authentication required')
  })

  it('returns default sequence configuration', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence).toBeDefined()
    expect(body.sequence.userId).toBe('user-1')
    expect(body.sequence.prefix).toBeDefined()
    expect(body.sequence.nextNumber).toBeGreaterThan(0)
    expect(body.sequence.format).toBeDefined()
    expect(body.sequence.createdAt).toBeDefined()
    expect(body.sequence.updatedAt).toBeDefined()
  })

  it('returns sequence with expected default values', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.prefix).toBe('INV-')
    expect(body.sequence.nextNumber).toBe(1001)
    expect(body.sequence.format).toContain('{prefix}')
    expect(body.sequence.format).toContain('{number}')
  })

  it('returns sequence for authenticated user', async () => {
    const differentAuth = { userId: 'user-2', role: 'freelancer', scopes: ['routes-b:read'] }
    mockedRequireScope.mockResolvedValue(differentAuth)
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.userId).toBe('user-2')
  })
})

describe('PATCH /api/routes-b/invoice-number-sequences', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockedRequireScope.mockRejectedValue(new RoutesBForbiddenError('missing'))
    const res = await PATCH(makePatch({ prefix: 'QUOTE-' }, null))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const req = new NextRequest(BASE_URL, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: 'invalid json{',
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('Invalid JSON body')
  })

  it('returns 400 when no fields are provided', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toBe('At least one field must be provided for update')
  })

  it('returns 400 for prefix exceeding max length', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const longPrefix = 'A'.repeat(21)
    const res = await PATCH(makePatch({ prefix: longPrefix }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details.fields).toBeDefined()
  })

  it('returns 400 for negative nextNumber', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ nextNumber: -5 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details.fields.nextNumber).toBeDefined()
  })

  it('returns 400 for zero nextNumber', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ nextNumber: 0 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-integer nextNumber', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ nextNumber: 100.5 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details.fields.nextNumber).toContain('integer')
  })

  it('returns 400 for format exceeding max length', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const longFormat = 'A'.repeat(101)
    const res = await PATCH(makePatch({ format: longFormat }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for format without valid placeholders', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ format: 'no-placeholders-here' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain('valid placeholder')
  })

  it('updates prefix successfully', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ prefix: 'QUOTE-' }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.prefix).toBe('QUOTE-')
    expect(body.sequence.userId).toBe('user-1')
    expect(body.sequence.updatedAt).toBeDefined()
  })

  it('updates nextNumber successfully', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ nextNumber: 5000 }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.nextNumber).toBe(5000)
  })

  it('updates format successfully with {prefix} placeholder', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ format: '{prefix}{number}' }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.format).toBe('{prefix}{number}')
  })

  it('updates format successfully with {year} placeholder', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ format: 'INV-{year}-{number}' }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.format).toBe('INV-{year}-{number}')
  })

  it('updates format successfully with {month} placeholder', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ format: '{year}{month}-{number}' }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.format).toBe('{year}{month}-{number}')
  })

  it('updates multiple fields successfully', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(
      makePatch({
        prefix: 'EST-',
        nextNumber: 2000,
        format: '{prefix}{year}-{number}',
      })
    )
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.prefix).toBe('EST-')
    expect(body.sequence.nextNumber).toBe(2000)
    expect(body.sequence.format).toBe('{prefix}{year}-{number}')
    expect(body.sequence.updatedAt).toBeDefined()
  })

  it('accepts empty string as prefix', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ prefix: '' }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.prefix).toBe('')
  })

  it('accepts nextNumber of 1', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ nextNumber: 1 }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.nextNumber).toBe(1)
  })

  it('accepts large nextNumber values', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const res = await PATCH(makePatch({ nextNumber: 999999 }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.nextNumber).toBe(999999)
  })

  it('preserves userId in updated sequence', async () => {
    const differentAuth = { userId: 'user-3', role: 'freelancer', scopes: ['routes-b:read'] }
    mockedRequireScope.mockResolvedValue(differentAuth)
    const res = await PATCH(makePatch({ prefix: 'DOC-' }))
    expect(res.status).toBe(200)
    
    const body = await res.json()
    expect(body.sequence.userId).toBe('user-3')
  })

  it('returns updatedAt timestamp', async () => {
    mockedRequireScope.mockResolvedValue(AUTH)
    const beforeUpdate = new Date()
    const res = await PATCH(makePatch({ nextNumber: 3000 }))
    const afterUpdate = new Date()
    
    expect(res.status).toBe(200)
    const body = await res.json()
    const updatedAt = new Date(body.sequence.updatedAt)
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime())
    expect(updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime())
  })
})
