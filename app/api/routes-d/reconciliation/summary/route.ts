import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [totalTransactions, matchedTransactions, totalInvoices, paidInvoices] = await Promise.all([
      prisma.transaction.count({
        where: { userId: user.id },
      }),
      prisma.transaction.count({
        where: {
          userId: user.id,
          invoiceId: { not: null },
        },
      }),
      prisma.invoice.count({
        where: { userId: user.id },
      }),
      prisma.invoice.count({
        where: {
          userId: user.id,
          status: 'paid',
        },
      }),
    ])

    const unmatchedTransactions = totalTransactions - matchedTransactions
    const unpaidInvoices = totalInvoices - paidInvoices
    const matchedPercentage = totalTransactions > 0 ? Math.round((matchedTransactions / totalTransactions) * 100) : 0
    const paidPercentage = totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0

    return NextResponse.json({
      summary: {
        transactions: {
          total: totalTransactions,
          matched: matchedTransactions,
          unmatched: unmatchedTransactions,
          matchedPercentage,
        },
        invoices: {
          total: totalInvoices,
          paid: paidInvoices,
          unpaid: unpaidInvoices,
          paidPercentage,
        },
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/reconciliation/summary error')
    return NextResponse.json({ error: 'Failed to fetch reconciliation summary' }, { status: 500 })
  }
}
