import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/search/products — search the authenticated user's products by name

const MAX_RESULTS = 20

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
    const q = searchParams.get('q')?.trim()
    if (!q) {
      return NextResponse.json({ error: 'q is required' }, { status: 400 })
    }

    const products = await prisma.product.findMany({
      where: {
        userId: user.id,
        name: { contains: q, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_RESULTS,
      select: {
        id: true,
        name: true,
        description: true,
        priceUsdc: true,
        unit: true,
        isActive: true,
      },
    })

    return NextResponse.json({
      products: products.map((p) => ({ ...p, priceUsdc: Number(p.priceUsdc) })),
    })
  } catch (error) {
    logger.error({ err: error }, 'Product search error')
    return NextResponse.json({ error: 'Failed to search products' }, { status: 500 })
  }
}
