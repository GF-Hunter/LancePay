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

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json()
    const { primaryId, duplicateIds } = body

    if (!primaryId || typeof primaryId !== 'string' || primaryId.trim() === '') {
      return NextResponse.json({ error: 'primaryId is required' }, { status: 400 })
    }
    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      return NextResponse.json(
        { error: 'duplicateIds must be a non-empty array' },
        { status: 400 },
      )
    }
    if (duplicateIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
      return NextResponse.json(
        { error: 'duplicateIds must contain non-empty strings' },
        { status: 400 },
      )
    }

    const uniqueDuplicateIds = [...new Set(duplicateIds as string[])]
    if (uniqueDuplicateIds.includes(primaryId)) {
      return NextResponse.json(
        { error: 'primaryId cannot be included in duplicateIds' },
        { status: 400 },
      )
    }

    const primary = await prisma.contact.findFirst({
      where: { id: primaryId, userId: user.id, deletedAt: null },
    })
    if (!primary) {
      return NextResponse.json({ error: 'Primary contact not found' }, { status: 404 })
    }

    const duplicates = await prisma.contact.findMany({
      where: { id: { in: uniqueDuplicateIds }, userId: user.id, deletedAt: null },
    })
    if (duplicates.length !== uniqueDuplicateIds.length) {
      return NextResponse.json(
        { error: 'One or more duplicate contacts not found' },
        { status: 404 },
      )
    }

    // Fill gaps in the primary from the duplicates (first non-empty value
    // wins); the primary's own values are never overwritten.
    const merged: Record<string, unknown> = {}
    for (const field of ['phone', 'company', 'notes'] as const) {
      if (primary[field]) continue
      const source = duplicates.find((d) => d[field])
      if (source) merged[field] = source[field]
    }

    const now = new Date()
    const [contact] = await prisma.$transaction([
      prisma.contact.update({
        where: { id: primary.id },
        data: merged,
      }),
      prisma.contact.updateMany({
        where: { id: { in: uniqueDuplicateIds }, userId: user.id },
        data: { deletedAt: now },
      }),
    ])

    return NextResponse.json({
      contact,
      mergedCount: uniqueDuplicateIds.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/address-book/merge error')
    return NextResponse.json({ error: 'Failed to merge contacts' }, { status: 500 })
  }
}
