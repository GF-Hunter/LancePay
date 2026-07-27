import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

type XeroSyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

type XeroSyncRecord = {
  syncId: string
  status: XeroSyncStatus
  lastSyncedAt: string | null
  nextScheduledAt: string | null
  ledgerEntriesSynced: number
  errors: string[]
}

// Deterministic mock state keyed by userId (no DB model for Xero sync yet).
function getSyncState(userId: string): XeroSyncRecord {
  const seed = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const statuses: XeroSyncStatus[] = ['idle', 'synced', 'synced', 'synced']
  const status = statuses[seed % statuses.length]

  const base = new Date('2025-01-01T00:00:00Z').getTime()
  const lastMs = base + (seed % 1000) * 86_400_000
  const lastSyncedAt = status === 'synced' ? new Date(lastMs).toISOString() : null
  const nextScheduledAt = new Date(lastMs + 24 * 3_600_000).toISOString()

  return {
    syncId: `sync_${userId.slice(0, 8)}_xero`,
    status,
    lastSyncedAt,
    nextScheduledAt,
    ledgerEntriesSynced: status === 'synced' ? 50 + (seed % 200) : 0,
    errors: [],
  }
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  return claims ? claims.userId : null
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const state = getSyncState(userId)
  return NextResponse.json(state)
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const options = (body ?? {}) as Record<string, unknown>
  const fullSync = options.fullSync === true
  const fromDate = typeof options.fromDate === 'string' ? options.fromDate : null

  if (fromDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return NextResponse.json(
      { error: 'fromDate must be in YYYY-MM-DD format when provided' },
      { status: 400 },
    )
  }

  const syncId = `sync_${userId.slice(0, 8)}_xero_${Date.now()}`

  return NextResponse.json(
    {
      syncId,
      status: 'syncing',
      fullSync,
      fromDate,
      enqueuedAt: new Date().toISOString(),
      estimatedCompletionSeconds: fullSync ? 120 : 30,
    },
    { status: 202 },
  )
}
