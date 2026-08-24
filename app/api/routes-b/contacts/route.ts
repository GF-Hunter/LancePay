import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DEFAULT_PAGE_SIZE = 20
const MAX_LIMIT = 100

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

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: { userId: user.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.contact.count({ where: { userId: user.id, deletedAt: null } }),
    ])

    return NextResponse.json({
      contacts,
      total,
      page,
      limit,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/contacts error')
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}
