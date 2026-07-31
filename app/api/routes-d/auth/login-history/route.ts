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

    const sessions = await prisma.userSession.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        userAgent: true,
        ipAddress: true,
        issuedAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
    })

    return NextResponse.json({ history: sessions })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/auth/login-history error')
    return NextResponse.json({ error: 'Failed to fetch login history' }, { status: 500 })
  }
}
