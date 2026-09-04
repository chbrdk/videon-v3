import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { ApiError, ApiErrorCode } from '@videon-v3/contracts'
import { federationHeaders } from './federation'

export function requestIdFor(request: Request): string {
  return request.headers.get('X-Request-Id')?.trim() || randomUUID()
}

export function apiError(
  request: Request,
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: { retryable?: boolean; details?: Record<string, unknown> },
) {
  const requestId = requestIdFor(request)
  const body: ApiError = {
    error: {
      code,
      message,
      retryable: options?.retryable ?? false,
      requestId,
      ...(options?.details ? { details: options.details } : {}),
    },
  }
  return NextResponse.json(body, {
    status,
    headers: { ...federationHeaders(), 'X-Request-Id': requestId },
  })
}

export function apiJson(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { ...federationHeaders(), 'X-Request-Id': requestIdFor(request) },
  })
}
