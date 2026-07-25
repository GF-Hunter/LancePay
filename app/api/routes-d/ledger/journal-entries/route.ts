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

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const skip = (page - 1) * limit

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.journalEntry.count({ where: { userId: user.id } }),
    ])

    return NextResponse.json({ entries, total, page, limit })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/ledger/journal-entries error')
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json()
    const { debitAccount, creditAccount, amount, currency, description, date } = body

    if (!debitAccount || typeof debitAccount !== 'string' || debitAccount.trim() === '') {
      return NextResponse.json({ error: 'debitAccount is required' }, { status: 400 })
    }
    if (!creditAccount || typeof creditAccount !== 'string' || creditAccount.trim() === '') {
      return NextResponse.json({ error: 'creditAccount is required' }, { status: 400 })
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    if (!currency || typeof currency !== 'string') {
      return NextResponse.json({ error: 'currency is required' }, { status: 400 })
    }

    const entry = await prisma.journalEntry.create({
      data: {
        userId: user.id,
        debitAccount: debitAccount.trim(),
        creditAccount: creditAccount.trim(),
        amount,
        currency: currency.toUpperCase(),
        description: description?.trim() ?? null,
        date: date ? new Date(date) : new Date(),
      },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/ledger/journal-entries error')
    return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 })
  }
}
