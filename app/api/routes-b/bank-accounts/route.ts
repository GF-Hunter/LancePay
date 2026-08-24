import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DEFAULT_PAGE_SIZE = 20
const MAX_LIMIT = 100
const MAX_NICKNAME_LENGTH = 32

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
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10))
    )

    const [bankAccounts, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          bankName: true,
          bankCode: true,
          accountNumber: true,
          accountName: true,
          isVerified: true,
          isDefault: true,
          nickname: true,
          createdAt: true,
        },
      }),
      prisma.bankAccount.count({ where: { userId: user.id } }),
    ])

    return NextResponse.json({
      bankAccounts,
      total,
      page,
      limit,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/bank-accounts error')
    return NextResponse.json({ error: 'Failed to fetch bank accounts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>

    const bankName = typeof payload.bankName === 'string' ? payload.bankName.trim() : null
    if (!bankName) {
      return NextResponse.json({ error: 'bankName is required' }, { status: 400 })
    }

    const bankCode = typeof payload.bankCode === 'string' ? payload.bankCode.trim() : null
    if (!bankCode) {
      return NextResponse.json({ error: 'bankCode is required' }, { status: 400 })
    }

    const accountNumber = typeof payload.accountNumber === 'string' ? payload.accountNumber.trim() : null
    if (!accountNumber) {
      return NextResponse.json({ error: 'accountNumber is required' }, { status: 400 })
    }

    const accountName = typeof payload.accountName === 'string' ? payload.accountName.trim() : null
    if (!accountName) {
      return NextResponse.json({ error: 'accountName is required' }, { status: 400 })
    }

    const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : null
    if (nickname && nickname.length > MAX_NICKNAME_LENGTH) {
      return NextResponse.json(
        { error: `nickname must be at most ${MAX_NICKNAME_LENGTH} characters` },
        { status: 400 }
      )
    }

    const isDefault = payload.isDefault === true
    const isVerified = payload.isVerified === true

    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankName,
        bankCode,
        accountNumber,
        accountName,
        nickname: nickname || null,
        isDefault,
        isVerified,
      },
      select: {
        id: true,
        bankName: true,
        bankCode: true,
        accountNumber: true,
        accountName: true,
        isVerified: true,
        isDefault: true,
        nickname: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ bankAccount }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/bank-accounts error')
    return NextResponse.json({ error: 'Failed to create bank account' }, { status: 500 })
  }
}
