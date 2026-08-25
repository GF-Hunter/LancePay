import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/recent-items — recent activity feed (invoices, transactions, expenses)

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type RecentItem = {
  type: 'invoice' | 'transaction' | 'expense'
  id: string
  title: string
  amount: number
  currency: string
  status: string | null
  createdAt: Date
}

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
    const rawLimit = searchParams.get('limit')
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : DEFAULT_LIMIT
    if (rawLimit && (Number.isNaN(parsedLimit) || parsedLimit < 1)) {
      return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 })
    }
    const limit = Math.min(parsedLimit || DEFAULT_LIMIT, MAX_LIMIT)

    const [invoices, transactions, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.expense.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          createdAt: true,
        },
      }),
    ])

    const items: RecentItem[] = [
      ...invoices.map((inv) => ({
        type: 'invoice' as const,
        id: inv.id,
        title: inv.invoiceNumber,
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        createdAt: inv.createdAt,
      })),
      ...transactions.map((tx) => ({
        type: 'transaction' as const,
        id: tx.id,
        title: tx.type,
        amount: Number(tx.amount),
        currency: tx.currency,
        status: tx.status,
        createdAt: tx.createdAt,
      })),
      ...expenses.map((exp) => ({
        type: 'expense' as const,
        id: exp.id,
        title: exp.description,
        amount: Number(exp.amount),
        currency: exp.currency,
        status: null,
        createdAt: exp.createdAt,
      })),
    ]

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return NextResponse.json({ items: items.slice(0, limit) })
  } catch (error) {
    logger.error({ err: error }, 'Recent items feed error')
    return NextResponse.json({ error: 'Failed to load recent items' }, { status: 500 })
  }
}
