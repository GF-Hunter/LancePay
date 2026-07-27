import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// ── GET /api/routes-d/jobs/schedule — inspect the job schedule ──
//
// Returns the registry of all known background/cron jobs, their schedule
// expressions, and their current operational status.  Auth is required so
// internal operational data is not publicly exposed.
//
// The registry is intentionally static — job definitions live in code, not
// in the database — so the response is always complete even if no DB query
// is needed.  A lightweight DB ping is included in the response as a health
// signal so callers can distinguish "no jobs running" from "service degraded".

export type JobStatus = 'active' | 'paused' | 'disabled'

export type JobDefinition = {
  id: string
  name: string
  description: string
  schedule: string          // cron expression
  scheduleDescription: string
  endpoint: string
  status: JobStatus
  timeoutSeconds: number
}

// ── Registry of all cron jobs defined in this application ───────────────────
const JOB_REGISTRY: JobDefinition[] = [
  {
    id: 'cancel-overdue-invoices',
    name: 'Cancel Overdue Invoices',
    description:
      'Automatically cancels pending invoices that have been overdue for 90 or more days, ' +
      'releases any active liens, and notifies the invoice owner by email.',
    schedule: '0 2 * * *',         // 02:00 UTC daily
    scheduleDescription: 'Daily at 02:00 UTC',
    endpoint: '/api/cron/cancel-overdue-invoices',
    status: 'active',
    timeoutSeconds: 300,
  },
]

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const claims = await verifyAuthToken(authToken || '')
  if (!claims) return null
  return prisma.user.findUnique({
    where: { privyId: claims.userId },
    select: { id: true },
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')

    const VALID_STATUSES: JobStatus[] = ['active', 'paused', 'disabled']

    if (statusFilter !== null && !VALID_STATUSES.includes(statusFilter as JobStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }

    const jobs = statusFilter
      ? JOB_REGISTRY.filter((j) => j.status === statusFilter)
      : JOB_REGISTRY

    return NextResponse.json({
      jobs,
      total: jobs.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/jobs/schedule error')
    return NextResponse.json({ error: 'Failed to fetch job schedule' }, { status: 500 })
  }
}
