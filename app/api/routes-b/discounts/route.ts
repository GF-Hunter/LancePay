import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET  /api/routes-b/discounts — list the authenticated user's discount codes.
// POST /api/routes-b/discounts — create a new discount code.
//
// GET query params (all optional):
//   active — filter by active status ('true' | 'false')
//   page   — 1-based page number (default: 1)
//   limit  — page size 1–100 (default: 25)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const VALID_TYPES = ['percent', 'fixed'] as const
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/i

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function serializeDiscount(discount: {
  id: string
  code: string
  type: string
  value: { toString(): string }
  active: boolean
  maxRedemptions: number | null
  redemptions: number
  expiresAt: Date | null
  createdAt: Date
}) {
  return {
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: Number(discount.value),
    active: discount.active,
    maxRedemptions: discount.maxRedemptions,
    redemptions: discount.redemptions,
    expiresAt: discount.expiresAt ? discount.expiresAt.toISOString() : null,
    createdAt: discount.createdAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const activeParam = searchParams.get('active')
    const page = parsePage(searchParams.get('page'))
    const limit = parseLimit(searchParams.get('limit'))

    if (activeParam !== null && activeParam !== 'true' && activeParam !== 'false') {
      return NextResponse.json({ error: 'active must be true or false' }, { status: 400 })
    }

    const where = {
      userId: user.id,
      ...(activeParam !== null ? { active: activeParam === 'true' } : {}),
    }

    const [total, discounts] = await Promise.all([
      prisma.discount.count({ where }),
      prisma.discount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          active: true,
          maxRedemptions: true,
          redemptions: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ])

    return NextResponse.json({
      discounts: discounts.map(serializeDiscount),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/discounts error')
    return NextResponse.json({ error: 'Failed to fetch discounts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const { code, type, value, maxRedemptions, expiresAt } = payload

    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { error: 'code is required and must be 3-32 uppercase letters, digits, - or _' },
        { status: 400 },
      )
    }

    const discountType = type === undefined ? 'percent' : type
    if (typeof discountType !== 'string' || !(VALID_TYPES as readonly string[]).includes(discountType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return NextResponse.json({ error: 'value must be a positive number' }, { status: 400 })
    }
    if (discountType === 'percent' && parsedValue > 100) {
      return NextResponse.json({ error: 'a percent discount value cannot exceed 100' }, { status: 400 })
    }

    let parsedMaxRedemptions: number | null = null
    if (maxRedemptions !== undefined && maxRedemptions !== null) {
      const n = Number(maxRedemptions)
      if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        return NextResponse.json(
          { error: 'maxRedemptions must be a positive integer' },
          { status: 400 },
        )
      }
      parsedMaxRedemptions = n
    }

    let parsedExpiresAt: Date | null = null
    if (expiresAt !== undefined && expiresAt !== null) {
      if (typeof expiresAt !== 'string') {
        return NextResponse.json({ error: 'expiresAt must be an ISO date string' }, { status: 400 })
      }
      const d = new Date(expiresAt)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'expiresAt must be a valid ISO date string' }, { status: 400 })
      }
      parsedExpiresAt = d
    }

    const normalizedCode = code.toUpperCase()

    const existing = await prisma.discount.findUnique({
      where: { userId_code: { userId: user.id, code: normalizedCode } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'A discount with this code already exists' }, { status: 409 })
    }

    const discount = await prisma.discount.create({
      data: {
        userId: user.id,
        code: normalizedCode,
        type: discountType,
        value: parsedValue,
        maxRedemptions: parsedMaxRedemptions,
        expiresAt: parsedExpiresAt,
      },
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        active: true,
        maxRedemptions: true,
        redemptions: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ discount: serializeDiscount(discount) }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/discounts error')
    return NextResponse.json({ error: 'Failed to create discount' }, { status: 500 })
  }
}
