import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

// GET /api/routes-b/automations/triggers — list available automation trigger types.

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return null
  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
  return user ? user.id : null
}

const TRIGGERS = [
  { value: 'invoice_paid', label: 'Invoice paid', description: 'Fires when an invoice is marked as paid.' },
  { value: 'invoice_overdue', label: 'Invoice overdue', description: 'Fires when an invoice becomes overdue.' },
  { value: 'payment_received', label: 'Payment received', description: 'Fires when a payment is received.' },
  { value: 'client_added', label: 'Client added', description: 'Fires when a new client is added.' },
]

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ triggers: TRIGGERS })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/automations/triggers error')
    return NextResponse.json({ error: 'Failed to fetch automation triggers' }, { status: 500 })
  }
}
