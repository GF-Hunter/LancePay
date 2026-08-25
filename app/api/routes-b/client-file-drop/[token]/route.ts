import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

// GET,POST /api/routes-b/client-file-drop/[token] — client-facing file drop
//
// This endpoint is accessed directly by a freelancer's client via a shared
// link, so it is gated by a single-use/expiring drop token rather than
// Privy auth.

const MAX_FILES_PER_REQUEST = 10

type FileDropDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

type FileDropItemDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
  createMany: (args: Record<string, unknown>) => Promise<{ count: number }>
}

function getFileDropDelegate(): FileDropDelegate {
  return (prisma as unknown as { clientFileDrop: FileDropDelegate }).clientFileDrop
}

function getFileDropItemDelegate(): FileDropItemDelegate {
  return (prisma as unknown as { clientFileDropItem: FileDropItemDelegate }).clientFileDropItem
}

async function findActiveDrop(token: string) {
  const delegate = getFileDropDelegate()
  const drop = await delegate.findFirst({ where: { token } })
  if (!drop) return null

  const expiresAt = drop.expiresAt as Date | string | null | undefined
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return null
  }

  return drop
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token || !token.trim()) {
      return NextResponse.json({ error: 'Drop token is required' }, { status: 400 })
    }

    const drop = await findActiveDrop(token)
    if (!drop) {
      return NextResponse.json({ error: 'File drop not found or expired' }, { status: 404 })
    }

    const itemDelegate = getFileDropItemDelegate()
    const files = await itemDelegate.findMany({
      where: { dropId: drop.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileName: true, fileUrl: true, sizeBytes: true, createdAt: true },
    })

    return NextResponse.json({
      dropId: drop.id,
      status: drop.status ?? 'active',
      files,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/routes-b/client-file-drop/[token] error')
    return NextResponse.json({ error: 'Failed to fetch file drop' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token || !token.trim()) {
      return NextResponse.json({ error: 'Drop token is required' }, { status: 400 })
    }

    const drop = await findActiveDrop(token)
    if (!drop) {
      return NextResponse.json({ error: 'File drop not found or expired' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = (body ?? {}) as Record<string, unknown>
    const rawFiles = Array.isArray(payload.files) ? payload.files : []

    if (rawFiles.length === 0) {
      return NextResponse.json({ error: 'At least one file is required' }, { status: 400 })
    }

    if (rawFiles.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `At most ${MAX_FILES_PER_REQUEST} files are allowed per request` },
        { status: 400 },
      )
    }

    const files: { fileName: string; fileUrl: string; sizeBytes: number | null }[] = []
    for (const raw of rawFiles) {
      if (typeof raw !== 'object' || raw === null) {
        return NextResponse.json({ error: 'Each file must be an object' }, { status: 400 })
      }
      const file = raw as Record<string, unknown>
      if (typeof file.fileName !== 'string' || !file.fileName.trim()) {
        return NextResponse.json({ error: 'Each file requires a fileName' }, { status: 400 })
      }
      if (typeof file.fileUrl !== 'string' || !file.fileUrl.trim()) {
        return NextResponse.json({ error: 'Each file requires a fileUrl' }, { status: 400 })
      }
      files.push({
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        sizeBytes: typeof file.sizeBytes === 'number' ? file.sizeBytes : null,
      })
    }

    const itemDelegate = getFileDropItemDelegate()
    const result = await itemDelegate.createMany({
      data: files.map((f) => ({
        dropId: drop.id,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        sizeBytes: f.sizeBytes,
      })),
    })

    logger.info({ dropId: drop.id, filesAdded: result.count }, 'POST /api/routes-b/client-file-drop/[token]')

    return NextResponse.json(
      { dropId: drop.id, filesAdded: result.count },
      { status: 201 },
    )
  } catch (error) {
    logger.error({ err: error }, 'POST /api/routes-b/client-file-drop/[token] error')
    return NextResponse.json({ error: 'Failed to upload to file drop' }, { status: 500 })
  }
}
