import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

/**
 * Middleware wrapper that adds a request ID to the response headers
 * for tracing and debugging purposes.
 */
export function withRequestId(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID()
    const response = await handler(request)
    response.headers.set('x-request-id', requestId)
    return response
  }
}
