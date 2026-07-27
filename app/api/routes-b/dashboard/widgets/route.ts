import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const VALID_WIDGET_TYPES = [
  'revenue_chart',
  'invoice_summary',
  'client_count',
  'recent_transactions',
  'upcoming_payments',
  'balance_overview',
] as const

type WidgetType = (typeof VALID_WIDGET_TYPES)[number]

type WidgetDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
  upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getWidgetDelegate(): WidgetDelegate {
  return (prisma as unknown as { dashboardWidget: WidgetDelegate }).dashboardWidget
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return null
  const user = await prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
  return user ? user.id : null
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const delegate = getWidgetDelegate()
  const widgets = await delegate.findMany({
    where: { userId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      type: true,
      position: true,
      visible: true,
      config: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ widgets })
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>

  const type = payload.type as string | undefined
  if (!type || !VALID_WIDGET_TYPES.includes(type as WidgetType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_WIDGET_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  const position = typeof payload.position === 'number' ? Math.max(0, Math.floor(payload.position)) : 0
  const visible = payload.visible !== false

  const delegate = getWidgetDelegate()
  const widget = await delegate.upsert({
    where: { userId_type: { userId, type } },
    update: { position, visible, config: payload.config ?? {} },
    create: { userId, type, position, visible, config: payload.config ?? {} },
    select: {
      id: true,
      type: true,
      position: true,
      visible: true,
      config: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(widget, { status: 200 })
}
