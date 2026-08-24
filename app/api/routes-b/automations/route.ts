import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const MAX_NAME_LENGTH = 100
const VALID_TRIGGERS = ['invoice_paid', 'invoice_overdue', 'payment_received', 'client_added']
const VALID_ACTIONS = ['send_email', 'send_notification', 'tag_client', 'create_task']

type AutomationRuleDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

function getAutomationRuleDelegate(): AutomationRuleDelegate {
  return (prisma as unknown as { automationRule: AutomationRuleDelegate }).automationRule
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

const SELECT_FIELDS = {
  id: true,
  name: true,
  trigger: true,
  action: true,
  config: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const delegate = getAutomationRuleDelegate()
  const rules = await delegate.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: SELECT_FIELDS,
  })

  return NextResponse.json({ rules })
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

  const name = typeof payload.name === 'string' ? payload.name.trim() : null
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `name must be at most ${MAX_NAME_LENGTH} characters` },
      { status: 400 },
    )
  }

  const trigger = typeof payload.trigger === 'string' ? payload.trigger : null
  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return NextResponse.json(
      { error: `trigger must be one of: ${VALID_TRIGGERS.join(', ')}` },
      { status: 400 },
    )
  }

  const action = typeof payload.action === 'string' ? payload.action : null
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  if (payload.config !== undefined && (typeof payload.config !== 'object' || payload.config === null || Array.isArray(payload.config))) {
    return NextResponse.json({ error: 'config must be an object' }, { status: 400 })
  }

  const isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : true

  const delegate = getAutomationRuleDelegate()
  const created = await delegate.create({
    data: {
      userId,
      name,
      trigger,
      action,
      config: payload.config ?? {},
      isActive,
    },
    select: SELECT_FIELDS,
  })

  return NextResponse.json({ rule: created }, { status: 201 })
}
