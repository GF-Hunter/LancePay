import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = Number(
    typeof (value as { toString?: () => string })?.toString === 'function'
      ? (value as { toString: () => string }).toString()
      : String(value),
  )
  return Number.isFinite(n) ? n : 0
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params

    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    const claims = await verifyAuthToken(authToken || '')
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.id !== clientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
    const until = searchParams.get('until')

    const dateFilter: Record<string, unknown> = {}
    if (since) {
      const d = new Date(since)
      if (!isNaN(d.getTime())) dateFilter.gte = d
    }
    if (until) {
      const d = new Date(until)
      if (!isNaN(d.getTime())) dateFilter.lte = d
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        clientId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        paidAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const totalAmount = invoices.reduce(
      (sum, inv) => sum + decimalToNumber((inv as { amount: unknown }).amount),
      0,
    )
    const paidAmount = invoices
      .filter((inv) => (inv as { status: string }).status === 'paid')
      .reduce((sum, inv) => sum + decimalToNumber((inv as { amount: unknown }).amount), 0)
    const pendingAmount = totalAmount - paidAmount

    const statement = {
      totalInvoices: invoices.length,
      totalAmount: totalAmount.toFixed(2),
      paidAmount: paidAmount.toFixed(2),
      pendingAmount: pendingAmount.toFixed(2),
      currency: invoices[0] ? (invoices[0] as { currency: string }).currency : 'USD',
      invoices: invoices.map((inv) => ({
        id: (inv as { id: string }).id,
        invoiceNumber: (inv as { invoiceNumber: string }).invoiceNumber,
        amount: (inv as { amount: unknown }).amount,
        status: (inv as { status: string }).status,
        createdAt: (inv as { createdAt: Date }).createdAt,
        paidAt: (inv as { paidAt: unknown }).paidAt || null,
      })),
    }

    return NextResponse.json({ statement })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
