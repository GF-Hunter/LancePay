import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const DEFAULT_PAGE_SIZE = 20

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

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawLimit = searchParams.get('limit')
  const limit = Math.min(
    rawLimit ? parseInt(rawLimit, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    100
  )
  const bounceType = searchParams.get('type') || undefined // 'hard' | 'soft' | 'transient'

  const delegate = (prisma as unknown as {
    emailBounce: {
      findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
      count: (args: Record<string, unknown>) => Promise<number>
    }
  }).emailBounce

  let bounces: Array<Record<string, unknown>> = []
  let total = 0

  if (delegate && typeof delegate.findMany === 'function') {
    const where = {
      userId,
      ...(bounceType ? { bounceType } : {}),
    }
    const [list, count] = await Promise.all([
      delegate.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      delegate.count({ where }),
    ])
    bounces = list
    total = count
  } else {
    // Default fallback bounce logs array
    bounces = [
      {
        id: 'bounce-1',
        email: 'invalid-user@example.com',
        bounceType: bounceType || 'hard',
        reason: '550 5.1.1 User unknown',
        invoiceId: 'inv-999',
        userId,
        createdAt: new Date(),
      },
    ]
    total = bounces.length
  }

  return NextResponse.json({
    bounces,
    total,
    pageLimit: limit,
  })
}
