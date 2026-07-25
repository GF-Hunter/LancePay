import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

interface CronJob {
  name: string
  schedule: string
  description: string
  lastRunAt: string | null
  nextRunAt: string | null
  enabled: boolean
}

const CRON_CATALOG: CronJob[] = [
  {
    name: 'invoice.reminders',
    schedule: '0 8 * * *',
    description: 'Send overdue invoice reminders to freelancers',
    lastRunAt: null,
    nextRunAt: null,
    enabled: true,
  },
  {
    name: 'bank-feed.sync',
    schedule: '*/15 * * * *',
    description: 'Pull latest transactions from connected bank accounts',
    lastRunAt: null,
    nextRunAt: null,
    enabled: true,
  },
  {
    name: 'webhook.retry',
    schedule: '*/5 * * * *',
    description: 'Retry failed webhook deliveries within the retry window',
    lastRunAt: null,
    nextRunAt: null,
    enabled: true,
  },
  {
    name: 'fx-rates.snapshot',
    schedule: '0 */1 * * *',
    description: 'Snapshot live FX rates for invoice currency conversion',
    lastRunAt: null,
    nextRunAt: null,
    enabled: true,
  },
  {
    name: 'subscriptions.billing',
    schedule: '0 0 * * *',
    description: 'Process due subscription renewal invoices',
    lastRunAt: null,
    nextRunAt: null,
    enabled: true,
  },
  {
    name: 'sanctions.screening',
    schedule: '0 2 * * 0',
    description: 'Weekly re-screen active users against sanctions lists',
    lastRunAt: null,
    nextRunAt: null,
    enabled: false,
  },
]

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const enabledOnly = searchParams.get('enabled') === 'true'

    const jobs = enabledOnly ? CRON_CATALOG.filter((j) => j.enabled) : CRON_CATALOG

    return NextResponse.json({
      jobs,
      total: jobs.length,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/cron/catalog error')
    return NextResponse.json({ error: 'Failed to fetch cron catalog' }, { status: 500 })
  }
}
