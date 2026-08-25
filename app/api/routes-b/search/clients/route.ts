import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/search/clients — search the authenticated user's clients by name or email
// Clients are derived from Invoice.clientEmail / Invoice.clientName since there is no
// standalone client model.

const MAX_RESULTS = 20

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId } })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json({ error: 'q is required' }, { status: 400 })
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        userId: user.id,
        OR: [
          { clientEmail: { contains: q, mode: 'insensitive' } },
          { clientName: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { clientEmail: true, clientName: true },
    })

    const clientsByEmail = new Map<string, { email: string; name: string | null }>()
    for (const inv of invoices) {
      if (!clientsByEmail.has(inv.clientEmail)) {
        clientsByEmail.set(inv.clientEmail, { email: inv.clientEmail, name: inv.clientName })
      }
    }

    const clients = Array.from(clientsByEmail.values()).slice(0, MAX_RESULTS)

    return NextResponse.json({ clients })
  } catch (error) {
    logger.error({ err: error }, 'Client search error')
    return NextResponse.json({ error: 'Failed to search clients' }, { status: 500 })
  }
}
