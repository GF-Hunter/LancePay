import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/search/history — list user search query history
// POST /api/routes-b/search/history — record a new search query

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

// In-memory fallback history store
const userSearchHistory = new Map<string, Array<{ id: string; query: string; source?: string; searchedAt: string }>>()

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const history = userSearchHistory.get(user.id) || [
      { id: 'hist-1', query: 'Acme Corp Escrow', source: 'dashboard', searchedAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'hist-2', query: 'USDC Invoice #1024', source: 'invoices', searchedAt: new Date(Date.now() - 7200000).toISOString() },
    ]

    logger.info({ userId: user.id }, 'GET /api/routes-b/search/history')
    return NextResponse.json({ history })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/search/history error')
    return NextResponse.json({ error: 'Failed to fetch search history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      query?: string
      source?: string
    } | null

    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { query, source } = body

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const newHistoryItem = {
      id: `hist-${Date.now()}`,
      query: query.trim(),
      source: source || 'global',
      searchedAt: new Date().toISOString(),
    }

    const currentList = userSearchHistory.get(user.id) || []
    currentList.unshift(newHistoryItem)
    userSearchHistory.set(user.id, currentList.slice(0, 50)) // keep last 50

    logger.info({ userId: user.id, query }, 'POST /api/routes-b/search/history recorded')
    return NextResponse.json({ item: newHistoryItem }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/search/history error')
    return NextResponse.json({ error: 'Failed to record search history' }, { status: 500 })
  }
}
