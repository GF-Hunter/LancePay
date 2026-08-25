import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/search/presets — list user saved search presets
// POST /api/routes-b/search/presets — save a new search preset

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

// In-memory fallback preset store
const userPresets = new Map<string, Array<{ id: string; name: string; query: string; filters?: Record<string, unknown>; createdAt: string }>>()

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const presets = userPresets.get(user.id) || [
      { id: 'preset-1', name: 'High Value USDC Invoices', query: 'currency:USDC amount:>1000', filters: { status: 'paid' }, createdAt: new Date().toISOString() },
      { id: 'preset-2', name: 'Pending Freelancer Escrows', query: 'status:in_escrow', filters: { type: 'milestone' }, createdAt: new Date().toISOString() },
    ]

    logger.info({ userId: user.id }, 'GET /api/routes-b/search/presets')
    return NextResponse.json({ presets })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/search/presets error')
    return NextResponse.json({ error: 'Failed to fetch search presets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      name?: string
      query?: string
      filters?: Record<string, unknown>
    } | null

    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { name, query, filters } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const newPreset = {
      id: `preset-${Date.now()}`,
      name: name.trim(),
      query: query.trim(),
      filters: filters || {},
      createdAt: new Date().toISOString(),
    }

    const currentList = userPresets.get(user.id) || []
    currentList.push(newPreset)
    userPresets.set(user.id, currentList)

    logger.info({ userId: user.id, presetId: newPreset.id }, 'POST /api/routes-b/search/presets created')
    return NextResponse.json({ preset: newPreset }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/search/presets error')
    return NextResponse.json({ error: 'Failed to save search preset' }, { status: 500 })
  }
}
