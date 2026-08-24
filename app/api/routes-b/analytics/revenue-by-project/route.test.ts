import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    invoice: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockVerify = verifyAuthToken as unknown as ReturnType<typeof vi.fn>
const mockUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockInvoiceFindMany = prisma.invoice.findMany as unknown as ReturnType<typeof vi.fn>
const mockProjectFindMany = prisma.project.findMany as unknown as ReturnType<typeof vi.fn>

const BASE_URL = 'http://localhost/api/routes-b/analytics/revenue-by-project'

const sampleInvoices = [
  { amount: 100, status: 'paid', clientName: 'Acme Corp' },
  { amount: 50, status: 'pending', clientName: 'Acme Corp' },
  { amount: 200, status: 'paid', clientName: 'Unknown Client' },
]

const sampleProjects = [{ id: 'proj-1', title: 'Website Revamp', clientName: 'Acme Corp' }]

function makeReq(query = '', token: string | null = 'Bearer valid-user-token') {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = token
  return new NextRequest(`${BASE_URL}${query}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue({ userId: 'privy-user-123' })
  mockUserFindUnique.mockResolvedValue({ id: 'user-123' })
  mockInvoiceFindMany.mockResolvedValue(sampleInvoices)
  mockProjectFindMany.mockResolvedValue(sampleProjects)
})

describe('GET /api/routes-b/analytics/revenue-by-project', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(makeReq('', null))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user is not found', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    const res = await GET(makeReq())
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('User not found')
  })

  it('returns 400 for a non-integer days parameter', async () => {
    const res = await GET(makeReq('?days=abc'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a days parameter out of range', async () => {
    const res = await GET(makeReq('?days=400'))
    expect(res.status).toBe(400)
  })

  it('scopes invoice and project lookups to the authenticated user (ownership check)', async () => {
    await GET(makeReq())
    expect(mockInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-123' }) }),
    )
    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-123' }) }),
    )
  })

  it('returns 200 with revenue matched to projects by client name on the happy path', async () => {
    const res = await GET(makeReq('?days=30'))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.report.days).toBe(30)

    const websiteProject = json.report.projects.find(
      (p: { title: string }) => p.title === 'Website Revamp',
    )
    expect(websiteProject.projectId).toBe('proj-1')
    expect(websiteProject.totalRevenue).toBe(150)
    expect(websiteProject.paidRevenue).toBe(100)
    expect(websiteProject.invoiceCount).toBe(2)

    const unassigned = json.report.projects.find((p: { title: string }) => p.title === 'Unassigned')
    expect(unassigned.projectId).toBeNull()
    expect(unassigned.totalRevenue).toBe(200)
  })

  it('returns an empty list when there are no invoices', async () => {
    mockInvoiceFindMany.mockResolvedValue([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report.projects).toEqual([])
  })

  it('returns 500 when an unexpected error occurs', async () => {
    mockInvoiceFindMany.mockRejectedValue(new Error('database unavailable'))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to fetch revenue by project report')
  })
})
