/**
 * adapters/tanstack.ts — TanStack Start server route adapter.
 *
 * TanStack Start server routes use the standard web `Request`/`Response`
 * objects, so this adapter is nearly identical to the Next.js one but
 * accepts a plain `Request` rather than `NextRequest`.
 *
 * @example
 * ```ts
 * // app/routes/api/webhook.ts
 * import { createAPIFileRoute } from '@tanstack/start/api'
 * import { tanstackWebhook } from 'jswa/adapters/tanstack'
 *
 * const handlers = tanstackWebhook(wa)
 * export const Route = createAPIFileRoute('/api/webhook')(handlers)
 * ```
 */

import type { WhatsApp } from '../client.js'

export function tanstackWebhook(wa: WhatsApp): {
  GET: (ctx: { request: Request }) => Promise<Response>
  POST: (ctx: { request: Request }) => Promise<Response>
} {
  return {
    async GET({ request }): Promise<Response> {
      const url = new URL(request.url)
      const mode = url.searchParams.get('hub.mode') ?? ''
      const token = url.searchParams.get('hub.verify_token') ?? ''
      const challenge = url.searchParams.get('hub.challenge') ?? ''
      const result = wa.handleChallenge(mode, token, challenge)
      if (result === null) return new Response('verification failed', { status: 403 })
      return new Response(result, { status: 200 })
    },
    async POST({ request }): Promise<Response> {
      const buf = Buffer.from(await request.arrayBuffer())
      const signature = request.headers.get('x-hub-signature-256') ?? undefined
      const result = await wa.processWebhook(buf, signature)
      return new Response(result.body, { status: result.status })
    },
  }
}
