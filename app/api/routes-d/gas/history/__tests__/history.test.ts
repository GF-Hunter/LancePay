import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { verifyAuthToken } from '@/lib/auth'
import { GET } from '../route'

const mockedVerify = vi.mocked(verifyAuthToken)

const BASE_URL = 'http://localhost/api/routes-d/gas/history'

function makeGet(query = '', authHeader: string | null = 'Bearer token') {
  return new NextRequest(`${BASE_URL}${query}`, {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('GET /api/routes-d/gas/history', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockedVerify.mockResolvedValue({ userId: 'privy_1' } as never)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeGet('', null))
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    mockedVerify.mockResolvedValue(null as never)
    const res = await GET(makeGet())
    expect(res.status).toBe(401)
  })

  it('defaults to 7 days of stellar history', async () => {
    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.network).toBe('stellar')
    expect(body.days).toBe(7)
    expect(body.points).toHaveLength(7)
    for (const point of body.points) {
      expect(point.unit).toBe('stroops')
      expect(point.min_fee).toBeLessThanOrEqual(point.avg_fee)
      expect(point.avg_fee).toBeLessThanOrEqual(point.max_fee)
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    // Points are chronological, ending today.
    const dates = body.points.map((p: { date: string }) => p.date)
    expect(dates).toEqual([...dates].sort())
  })

  it('supports other networks with their fee units', async () => {
    const res = await GET(makeGet('?network=base&days=3'))
    const body = await res.json()
    expect(body.network).toBe('base')
    expect(body.points).toHaveLength(3)
    expect(body.points[0].unit).toBe('gwei')
  })

  it('is deterministic for the same request', async () => {
    const first = await (await GET(makeGet('?days=5'))).json()
    const second = await (await GET(makeGet('?days=5'))).json()
    expect(second.points).toEqual(first.points)
  })

  it('rejects an unknown network', async () => {
    const res = await GET(makeGet('?network=dogecoin'))
    expect(res.status).toBe(400)
  })

  it('rejects an invalid days value', async () => {
    expect((await GET(makeGet('?days=0'))).status).toBe(400)
    expect((await GET(makeGet('?days=91'))).status).toBe(400)
    expect((await GET(makeGet('?days=abc'))).status).toBe(400)
  })
})
