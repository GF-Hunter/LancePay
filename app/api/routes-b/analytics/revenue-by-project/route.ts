import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/analytics/revenue-by-project - revenue by project report
//
// Invoices have no direct project reference, so revenue is attributed to a
// project by matching Invoice.clientName against Project.clientName (the
// only field the two models share). Invoices whose clientName does not
// match any project are grouped under "Unassigned".

const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const UNASSIGNED_KEY = 'unassigned'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')

    let days = DEFAULT_DAYS
    if (daysParam !== null) {
      days = Number(daysParam)
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        return NextResponse.json(
          { error: `days must be an integer between 1 and ${MAX_DAYS}` },
          { status: 400 },
        )
      }
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [invoices, projects] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId: user.id, createdAt: { gte: since } },
        select: { amount: true, status: true, clientName: true },
      }),
      prisma.project.findMany({
        where: { userId: user.id },
        select: { id: true, title: true, clientName: true },
      }),
    ])

    const projectsByClientName = new Map<string, { id: string; title: string }[]>()
    for (const project of projects) {
      if (!project.clientName) continue
      const key = project.clientName.trim().toLowerCase()
      const list = projectsByClientName.get(key) ?? []
      list.push({ id: project.id, title: project.title })
      projectsByClientName.set(key, list)
    }

    const byProject = new Map<
      string,
      { projectId: string | null; title: string; totalRevenue: number; paidRevenue: number; invoiceCount: number }
    >()

    for (const invoice of invoices) {
      const amount = Number(invoice.amount || 0)
      const key = invoice.clientName ? invoice.clientName.trim().toLowerCase() : ''
      const matches = key ? projectsByClientName.get(key) : undefined

      const targets = matches && matches.length > 0 ? matches : [{ id: UNASSIGNED_KEY, title: 'Unassigned' }]

      for (const target of targets) {
        const mapKey = target.id
        const existing = byProject.get(mapKey) ?? {
          projectId: target.id === UNASSIGNED_KEY ? null : target.id,
          title: target.title,
          totalRevenue: 0,
          paidRevenue: 0,
          invoiceCount: 0,
        }
        existing.totalRevenue += amount
        if (invoice.status === 'paid') existing.paidRevenue += amount
        existing.invoiceCount += 1
        byProject.set(mapKey, existing)
      }
    }

    const projectsReport = Array.from(byProject.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)

    return NextResponse.json({
      report: {
        days,
        projects: projectsReport,
      },
    })
  } catch (error) {
    logger.error({ err: error }, 'Get revenue by project report error')
    return NextResponse.json({ error: 'Failed to fetch revenue by project report' }, { status: 500 })
  }
}
