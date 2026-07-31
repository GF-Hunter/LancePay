import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { privyId: claims.userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    if (project.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'project.id', value: { stringValue: project.id } },
              { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } }
            ]
          },
          scopeMetrics: []
        }
      ]
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-d/metrics/otlp error')
    return NextResponse.json({ error: 'Failed to fetch OTLP metrics' }, { status: 500 })
  }
}
