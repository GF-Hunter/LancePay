import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

const VALID_PERIODS = ['daily', 'weekly', 'monthly']
const CHART_WIDTH = 640
const CHART_HEIGHT = 320
const CHART_PADDING = 32

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

function bucketLabel(date: Date, period: string): string {
  if (period === 'daily') {
    return date.toISOString().slice(0, 10)
  }
  if (period === 'weekly') {
    const firstDayOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    const days = Math.floor((date.getTime() - firstDayOfYear.getTime()) / 86400000)
    const week = Math.ceil((days + firstDayOfYear.getUTCDay() + 1) / 7)
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
  }
  return date.toISOString().slice(0, 7)
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderChartSvg(data: Array<{ label: string; amount: number }>, currency: string): string {
  const maxAmount = Math.max(1, ...data.map((d) => d.amount))
  const plotWidth = CHART_WIDTH - CHART_PADDING * 2
  const plotHeight = CHART_HEIGHT - CHART_PADDING * 2
  const barCount = Math.max(1, data.length)
  const barWidth = plotWidth / barCount
  const bars = data
    .map((d, i) => {
      const barHeight = (d.amount / maxAmount) * plotHeight
      const x = CHART_PADDING + i * barWidth + barWidth * 0.15
      const y = CHART_PADDING + (plotHeight - barHeight)
      const w = barWidth * 0.7
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="#4f46e5" rx="2" />
<text x="${(x + w / 2).toFixed(2)}" y="${(CHART_HEIGHT - CHART_PADDING + 16).toFixed(2)}" font-size="10" text-anchor="middle" fill="#374151">${escapeXml(d.label)}</text>`
    })
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="#ffffff" />
<text x="${CHART_PADDING}" y="20" font-size="14" font-weight="600" fill="#111827">Earnings (${escapeXml(currency)})</text>
${bars}
</svg>`
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'monthly'
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json(
      { error: `period must be one of: ${VALID_PERIODS.join(', ')}` },
      { status: 400 },
    )
  }

  const transactions = await prisma.transaction.findMany({
    where: { userId, type: 'payment', status: 'completed' },
    select: { amount: true, currency: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const buckets = new Map<string, number>()
  for (const tx of transactions) {
    const label = bucketLabel(tx.createdAt, period)
    buckets.set(label, (buckets.get(label) || 0) + Number(tx.amount))
  }

  const data = Array.from(buckets.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => (a.label < b.label ? -1 : 1))

  const currency = transactions[0]?.currency || 'USD'
  const svg = renderChartSvg(data, currency)

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `inline; filename="earnings-chart-${period}.svg"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
