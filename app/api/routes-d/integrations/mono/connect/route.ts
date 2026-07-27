import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: { id: true, email: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    let body: Record<string, unknown> = {}
    try {
      const text = await request.text()
      if (text.trim().length > 0) {
        body = JSON.parse(text)
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const code = typeof body.code === 'string' ? body.code.trim() : ''
    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 })
    }

    const monoAccountId = typeof body.monoAccountId === 'string' ? body.monoAccountId.trim() : ''

    logger.info(
      { userId: user.id, code: code.substring(0, 8) + '...' },
      'POST /api/routes-d/integrations/mono/connect executed'
    )

    return NextResponse.json(
      {
        connected: true,
        userId: user.id,
        monoAccountId: monoAccountId || null,
        status: 'active',
        connectedAt: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/integrations/mono/connect error')
    return NextResponse.json({ error: 'Failed to connect Mono account' }, { status: 500 })
  }
}
