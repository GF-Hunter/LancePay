import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

const SUPPORTED_EVENT_TYPES = [
  'inquiry.completed',
  'inquiry.failed',
  'inquiry.expired',
  'inquiry.created',
  'inquiry.pending',
  'inquiry.approved',
  'inquiry.declined',
] as const

type PersonaEventType = (typeof SUPPORTED_EVENT_TYPES)[number]

type PersonaPayload = {
  inquiryId: string
  accountId?: string
  status: string
  eventType: string
  completedAt?: string
  sandboxMode?: boolean
}

function validatePayload(body: unknown): { ok: true; payload: PersonaPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const b = body as Record<string, unknown>

  if (typeof b.inquiryId !== 'string' || !b.inquiryId.trim()) {
    return { ok: false, error: 'inquiryId is required' }
  }

  if (typeof b.eventType !== 'string' || !b.eventType.trim()) {
    return { ok: false, error: 'eventType is required' }
  }

  if (!SUPPORTED_EVENT_TYPES.includes(b.eventType as PersonaEventType)) {
    return { ok: false, error: `Unsupported event type: ${b.eventType}` }
  }

  if (typeof b.status !== 'string' || !b.status.trim()) {
    return { ok: false, error: 'status is required' }
  }

  return {
    ok: true,
    payload: {
      inquiryId: b.inquiryId.trim(),
      accountId: typeof b.accountId === 'string' ? b.accountId : undefined,
      status: b.status.trim(),
      eventType: b.eventType as PersonaEventType,
      completedAt: typeof b.completedAt === 'string' ? b.completedAt : undefined,
      sandboxMode: b.sandboxMode === true,
    },
  }
}

function deriveKycStatus(payload: PersonaPayload): string {
  if (payload.eventType === 'inquiry.completed' || payload.eventType === 'inquiry.approved') {
    return 'approved'
  }
  if (payload.eventType === 'inquiry.failed' || payload.eventType === 'inquiry.declined') {
    return 'rejected'
  }
  if (payload.eventType === 'inquiry.pending') return 'pending'
  if (payload.eventType === 'inquiry.expired') return 'expired'
  return 'processing'
}

export async function POST(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')

  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validation = validatePayload(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { payload } = validation
  const kycStatus = deriveKycStatus(payload)

  logger.info(
    { inquiryId: payload.inquiryId, eventType: payload.eventType, kycStatus },
    'POST /api/routes-d/integrations/persona/callback executed'
  )

  return NextResponse.json(
    {
      received: true,
      inquiryId: payload.inquiryId,
      accountId: payload.accountId ?? null,
      eventType: payload.eventType,
      kycStatus,
      processedAt: new Date().toISOString(),
    },
    { status: 200 }
  )
}
