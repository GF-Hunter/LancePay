import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-d/ip-allowlist  — list IPs on the authenticated user's allowlist
// POST /api/routes-d/ip-allowlist — add an IP address to the allowlist

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F:]+)$/

function isValidIp(ip: string): boolean {
  return IP_REGEX.test(ip)
}

const db = prisma as unknown as {
  ipAllowlist: {
    findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
    findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
    create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const entries = await db.ipAllowlist.findMany({
      where: { userId: user.id },
      select: { id: true, ipAddress: true, label: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    logger.info({ userId: user.id }, 'GET /api/routes-d/ip-allowlist')
    return NextResponse.json({ entries })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/ip-allowlist error')
    return NextResponse.json({ error: 'Failed to fetch IP allowlist' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      ipAddress?: string
      label?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { ipAddress, label } = body

    if (!ipAddress || typeof ipAddress !== 'string' || !ipAddress.trim()) {
      return NextResponse.json({ error: 'ipAddress is required' }, { status: 400 })
    }

    const trimmedIp = ipAddress.trim()
    if (!isValidIp(trimmedIp)) {
      return NextResponse.json({ error: 'ipAddress must be a valid IPv4 or IPv6 address' }, { status: 400 })
    }

    const existing = await db.ipAllowlist.findFirst({
      where: { userId: user.id, ipAddress: trimmedIp },
    })
    if (existing) {
      return NextResponse.json({ error: 'IP address is already on the allowlist' }, { status: 409 })
    }

    const entry = await db.ipAllowlist.create({
      data: {
        userId: user.id,
        ipAddress: trimmedIp,
        label: typeof label === 'string' ? label.trim() || null : null,
      },
      select: { id: true, ipAddress: true, label: true, createdAt: true },
    })

    logger.info({ userId: user.id, ipAddress: trimmedIp }, 'POST /api/routes-d/ip-allowlist added')
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/ip-allowlist error')
    return NextResponse.json({ error: 'Failed to add IP to allowlist' }, { status: 500 })
  }
}
