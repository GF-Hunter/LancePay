import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    dashboardWidget: { findMany: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ verifyAuthToken: vi.fn() }))

import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const mockUser = { id: 'user-1' }
const mockClaims = { userId: 'privy-1' }
const mockWidget = {
  id: 'widget-1',
  type: 'revenue_chart',
  position: 0,
  visible: true,
  config: {},
  updatedAt: new Date(),
}

function makeGet() {
  return new NextRequest('http://localhost/api/routes-b/dashboard/widgets', {
    headers: { authorization: 'Bearer token' },
  })
}

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/routes-b/dashboard/widgets', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyAuthToken).mockResolvedValue(mockClaims as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  vi.mocked(prisma.dashboardWidget.findMany).mockResolvedValue([mockWidget] as never)
  vi.mocked(prisma.dashboardWidget.upsert).mockResolvedValue(mockWidget as never)
})

describe('GET /api/routes-b/dashboard/widgets', () => {
  it('returns the widget list', async () => {
    const res = await GET(makeGet())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.widgets)).toBe(true)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/dashboard/widgets')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/routes-b/dashboard/widgets', () => {
  it('creates or updates a widget', async () => {
    const res = await POST(makePost({ type: 'revenue_chart', position: 0 }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.type).toBe('revenue_chart')
  })

  it('returns 400 for an invalid widget type', async () => {
    const res = await POST(makePost({ type: 'unknown_widget' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when type is missing', async () => {
    const res = await POST(makePost({ position: 1 }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/routes-b/dashboard/widgets', {
      method: 'POST',
      body: JSON.stringify({ type: 'revenue_chart' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
