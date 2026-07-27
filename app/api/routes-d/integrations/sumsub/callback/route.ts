import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'

const SUPPORTED_EVENT_TYPES = [
  'applicantReviewed',
  'applicantPending',
  'applicantCreated',
  'applicantOnHold',
  'applicantPersonalInfoChanged',
  'applicantReset',
  'inspectionReviewCompleted',
] as const

type SumsubEventType = (typeof SUPPORTED_EVENT_TYPES)[number]

type ReviewResult = {
  reviewAnswer: 'GREEN' | 'RED'
  rejectLabels?: string[]
  reviewRejectType?: 'FINAL' | 'RETRY'
  moderationComment?: string
}

type SumsubPayload = {
  applicantId: string
  inspectionId?: string
  correlationId?: string
  externalUserId?: string
  type: string
  reviewResult?: ReviewResult
  createdAtMs?: string
  sandboxMode?: boolean
}

function validatePayload(body: unknown): { ok: true; payload: SumsubPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const b = body as Record<string, unknown>

  if (typeof b.applicantId !== 'string' || !b.applicantId.trim()) {
    return { ok: false, error: 'applicantId is required' }
  }

  if (typeof b.type !== 'string' || !b.type.trim()) {
    return { ok: false, error: 'type is required' }
  }

  if (!SUPPORTED_EVENT_TYPES.includes(b.type as SumsubEventType)) {
    return { ok: false, error: `Unsupported event type: ${b.type}` }
  }

  if (b.externalUserId !== undefined && typeof b.externalUserId !== 'string') {
    return { ok: false, error: 'externalUserId must be a string when provided' }
  }

  return {
    ok: true,
    payload: {
      applicantId: b.applicantId.trim(),
      inspectionId: typeof b.inspectionId === 'string' ? b.inspectionId : undefined,
      correlationId: typeof b.correlationId === 'string' ? b.correlationId : undefined,
      externalUserId: typeof b.externalUserId === 'string' ? b.externalUserId : undefined,
      type: b.type as SumsubEventType,
      reviewResult: b.reviewResult as ReviewResult | undefined,
      createdAtMs: typeof b.createdAtMs === 'string' ? b.createdAtMs : undefined,
      sandboxMode: b.sandboxMode === true,
    },
  }
}

function deriveKycStatus(payload: SumsubPayload): string {
  if (payload.type === 'applicantReviewed' && payload.reviewResult) {
    return payload.reviewResult.reviewAnswer === 'GREEN' ? 'approved' : 'rejected'
  }
  if (payload.type === 'applicantPending') return 'pending'
  if (payload.type === 'applicantOnHold') return 'on_hold'
  if (payload.type === 'applicantReset') return 'reset'
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

  return NextResponse.json(
    {
      received: true,
      applicantId: payload.applicantId,
      externalUserId: payload.externalUserId ?? null,
      eventType: payload.type,
      kycStatus,
      processedAt: new Date().toISOString(),
    },
    { status: 200 },
  )
}
