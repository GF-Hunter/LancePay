import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// POST /api/routes-d/verify/age — submit age verification documents

const MIN_AGE = 18

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as {
      dateOfBirth?: string
      documentType?: string
      documentNumber?: string
    } | null
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const { dateOfBirth, documentType, documentNumber } = body

    if (!dateOfBirth || typeof dateOfBirth !== 'string') {
      return NextResponse.json({ error: 'dateOfBirth is required (YYYY-MM-DD)' }, { status: 400 })
    }

    const dob = new Date(dateOfBirth)
    if (isNaN(dob.getTime())) {
      return NextResponse.json({ error: 'dateOfBirth must be a valid date (YYYY-MM-DD)' }, { status: 400 })
    }

    const now = new Date()
    const ageYears = now.getFullYear() - dob.getFullYear() -
      (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)

    if (ageYears < MIN_AGE) {
      return NextResponse.json(
        { error: `Age verification failed: must be at least ${MIN_AGE} years old` },
        { status: 422 },
      )
    }

    if (!documentType || typeof documentType !== 'string') {
      return NextResponse.json({ error: 'documentType is required' }, { status: 400 })
    }

    const VALID_DOCUMENT_TYPES = ['passport', 'national_id', 'drivers_license']
    if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json(
        { error: `documentType must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    if (!documentNumber || typeof documentNumber !== 'string' || !documentNumber.trim()) {
      return NextResponse.json({ error: 'documentNumber is required' }, { status: 400 })
    }

    const db = prisma as unknown as {
      ageVerification: {
        upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
      }
    }

    const record = await db.ageVerification.upsert({
      where: { userId: user.id },
      update: {
        documentType,
        documentNumber: documentNumber.trim(),
        dateOfBirth: dob,
        status: 'pending',
        verifiedAt: null,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        documentType,
        documentNumber: documentNumber.trim(),
        dateOfBirth: dob,
        status: 'pending',
      },
    })

    logger.info({ userId: user.id, documentType }, 'POST /api/routes-d/verify/age submitted')

    return NextResponse.json(
      {
        id: record.id,
        status: record.status,
        documentType: record.documentType,
        submittedAt: (record.createdAt as Date).toISOString(),
        message: 'Age verification submitted and pending review',
      },
      { status: 202 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-d/verify/age error')
    return NextResponse.json({ error: 'Failed to submit age verification' }, { status: 500 })
  }
}
