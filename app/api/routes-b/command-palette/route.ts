import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

// GET /api/routes-b/command-palette — command palette suggestions and quick actions

async function getAuthenticatedUser(request: NextRequest) {
  const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return null
  const claims = await verifyAuthToken(authToken)
  if (!claims) return null
  return prisma.user.findUnique({ where: { privyId: claims.userId }, select: { id: true } })
}

const COMMAND_SUGGESTIONS = [
  { id: 'create-invoice', title: 'Create New Invoice', category: 'Invoicing', shortcut: 'N I', action: '/invoices/new', icon: 'file-plus' },
  { id: 'send-payment', title: 'Send Payment', category: 'Payments', shortcut: 'S P', action: '/payments/send', icon: 'send' },
  { id: 'request-payment', title: 'Request Payment / Escrow', category: 'Payments', shortcut: 'R P', action: '/escrow/create', icon: 'download' },
  { id: 'view-analytics', title: 'View Revenue Analytics', category: 'Reports', shortcut: 'G A', action: '/analytics', icon: 'bar-chart' },
  { id: 'export-transactions', title: 'Export Transaction Ledger', category: 'Reports', shortcut: 'E T', action: '/transactions/export', icon: 'download-cloud' },
  { id: 'manage-api-keys', title: 'Manage API Keys & Webhooks', category: 'Developer', shortcut: 'M K', action: '/settings/developer', icon: 'key' },
  { id: 'account-settings', title: 'Account & Security Settings', category: 'Settings', shortcut: 'G S', action: '/settings/profile', icon: 'settings' },
]

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const query = url.searchParams.get('q')?.toLowerCase().trim()

    let results = COMMAND_SUGGESTIONS
    if (query) {
      results = COMMAND_SUGGESTIONS.filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(query) ||
          cmd.category.toLowerCase().includes(query) ||
          cmd.id.toLowerCase().includes(query),
      )
    }

    logger.info({ userId: user.id, query }, 'GET /api/routes-b/command-palette')
    return NextResponse.json({
      suggestions: results,
      total: results.length,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/command-palette error')
    return NextResponse.json({ error: 'Failed to fetch command palette suggestions' }, { status: 500 })
  }
}
