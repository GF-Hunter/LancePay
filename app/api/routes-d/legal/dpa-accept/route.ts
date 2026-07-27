import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DPA_VERSION = '1.0'

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    let body: unknown = {}
    try {
      const text = await request.text()
      body = text ? JSON.parse(text) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const version = (body as Record<string, unknown>)?.version
    if (version !== undefined && typeof version !== 'string') {
      return NextResponse.json({ error: 'version must be a string' }, { status: 400 })
    }

    const acceptedAt = new Date()

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        dpaAccepted: true,
        dpaAcceptedAt: acceptedAt,
        dpaVersion: (version as string | undefined) ?? DPA_VERSION,
      } as object,
      select: { id: true },
    })

    return NextResponse.json({
      dpa: {
        accepted: true,
        version: (version as string | undefined) ?? DPA_VERSION,
        acceptedAt: acceptedAt.toISOString(),
        userId: updated.id,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/legal/dpa-accept error')
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
