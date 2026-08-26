import { NextResponse } from 'next/server'

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL'

export interface ErrorEnvelope {
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * Standardized error response format for routes-b endpoints.
 * Returns a NextResponse with the error envelope and specified status code.
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  status: number = 500
): NextResponse {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    },
  }

  return NextResponse.json(body, { status })
}
