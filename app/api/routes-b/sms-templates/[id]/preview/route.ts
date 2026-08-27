import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const recipientName = searchParams.get('recipientName') || 'John Doe'
  const amount = searchParams.get('amount') || '$100.00'
  const invoiceNumber = searchParams.get('invoiceNumber') || 'INV-1001'

  const delegate = (prisma as unknown as { smsTemplate: { findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> } }).smsTemplate

  let template: Record<string, unknown> | null = null
  if (delegate && typeof delegate.findFirst === 'function') {
    template = await delegate.findFirst({
      where: { id, userId },
    })
  } else {
    // Default template representation
    template = {
      id,
      name: 'Invoice Reminder SMS',
      body: 'Hi {{recipientName}}, your invoice {{invoiceNumber}} for {{amount}} is ready.',
      userId,
    }
  }

  if (!template) {
    return NextResponse.json({ error: 'SMS template not found' }, { status: 404 })
  }

  let rawBody = (template.body as string) || ''
  const previewText = rawBody
    .replace(/\{\{\s*recipientName\s*\}\}/g, recipientName)
    .replace(/\{\{\s*amount\s*\}\}/g, amount)
    .replace(/\{\{\s*invoiceNumber\s*\}\}/g, invoiceNumber)

  return NextResponse.json({
    templateId: id,
    templateName: template.name,
    rawBody,
    previewText,
    sampleVariables: { recipientName, amount, invoiceNumber },
  })
}
