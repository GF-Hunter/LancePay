import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAuthToken = vi.fn()
const userFindUnique = vi.fn()
const loggerError = vi.fn()

vi.mock('@/lib/auth', () => ({ verifyAuthToken }))
vi.mock('@/lib/logger', () => ({ logger: { error: loggerError } }))
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}))

const BASE_URL = 'http://localhost/api/routes-d/jobs/schedule'

function makeRequest(params: Record<string, string> = {}, token: string | null = 'Bearer token') {
  const url = new URL(BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(url.toString(), { headers })
}

describe('GET /api/routes-d/jobs/schedule', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Auth ────────────────────────────────────────────────────────────────

  it('returns 401 when no authorization header is provided', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest({}, null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when the token is invalid', async () => {
    verifyAuthToken.mockResolvedValue(null)
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  // ── Validation ──────────────────────────────────────────────────────────

  it('returns 400 for an invalid status filter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest({ status: 'unknown' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/status must be one of/)
  })

  // ── Happy path — full registry ──────────────────────────────────────────

  it('returns 200 with jobs array and total when authenticated', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.jobs)).toBe(true)
    expect(typeof json.total).toBe('number')
    expect(json.total).toBe(json.jobs.length)
  })

  it('includes required fields on every job entry', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    for (const job of json.jobs) {
      expect(job).toHaveProperty('id')
      expect(job).toHaveProperty('name')
      expect(job).toHaveProperty('description')
      expect(job).toHaveProperty('schedule')
      expect(job).toHaveProperty('scheduleDescription')
      expect(job).toHaveProperty('endpoint')
      expect(job).toHaveProperty('status')
      expect(job).toHaveProperty('timeoutSeconds')
    }
  })

  it('includes the cancel-overdue-invoices job in the registry', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    const job = json.jobs.find((j: { id: string }) => j.id === 'cancel-overdue-invoices')
    expect(job).toBeDefined()
    expect(job.endpoint).toBe('/api/cron/cancel-overdue-invoices')
    expect(job.status).toBe('active')
    expect(typeof job.schedule).toBe('string')
    expect(job.schedule.trim().length).toBeGreaterThan(0)
  })

  it('includes a timestamp in the response', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  // ── Status filter ───────────────────────────────────────────────────────

  it('filters by status=active and only returns matching jobs', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest({ status: 'active' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    for (const job of json.jobs) {
      expect(job.status).toBe('active')
    }
  })

  it('returns an empty jobs array when no jobs match the status filter', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest({ status: 'disabled' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.jobs).toEqual([])
    expect(json.total).toBe(0)
  })

  it('returns all valid statuses: active, paused, disabled without a 400', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockResolvedValue({ id: 'user_1' })
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    for (const status of ['active', 'paused', 'disabled']) {
      const res = await GET(makeRequest({ status }))
      expect(res.status).toBe(200)
    }
  })

  // ── Error handling ──────────────────────────────────────────────────────

  it('returns 500 on an unexpected error', async () => {
    verifyAuthToken.mockResolvedValue({ userId: 'privy_1' })
    userFindUnique.mockRejectedValue(new Error('DB crash'))
    const { GET } = await import('@/app/api/routes-d/jobs/schedule/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch job schedule')
    expect(loggerError).toHaveBeenCalled()
  })
})
