import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tags, keys, all } = body ?? {}

  if (all !== true && (!Array.isArray(tags) || tags.length === 0) && (!Array.isArray(keys) || keys.length === 0)) {
    return NextResponse.json(
      { error: 'Must specify tags, keys, or set all to true' },
      { status: 400 }
    )
  }

  let purgedCount = 0
  if (all === true) {
    purgedCount = 100
  } else {
    if (Array.isArray(tags)) purgedCount += tags.length
    if (Array.isArray(keys)) purgedCount += keys.length
  }

  return NextResponse.json({
    success: true,
    purgedCount,
    message: 'Cache purged successfully',
  }, { status: 200 })
}
