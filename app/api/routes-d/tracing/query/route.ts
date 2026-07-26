import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const limitStr = searchParams.get('limit') ?? '50'
  const offsetStr = searchParams.get('offset') ?? '0'
  const traceId = searchParams.get('traceId') ?? undefined
  const service = searchParams.get('service') ?? undefined

  const limit = parseInt(limitStr, 10)
  const offset = parseInt(offsetStr, 10)

  if (isNaN(limit) || limit < 1 || limit > 100 || isNaN(offset) || offset < 0) {
    return NextResponse.json({ error: 'Invalid pagination parameters' }, { status: 400 })
  }

  return NextResponse.json({
    traces: [],
    total: 0,
    limit,
    offset,
    filters: { traceId, service },
  }, { status: 200 })
}
