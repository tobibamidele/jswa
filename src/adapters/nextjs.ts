/**
 * adapters/nextjs.ts — Next.js App Router route handler adapter.
 *
 * Use in `app/api/webhook/route.ts`:
 * ```ts
 * export const { GET, POST } = nextjsWebhook(wa)
 * ```
 */

import type { WhatsApp } from '../client.js'

/** Minimal shape of Next.js's `NextRequest` this adapter depends on. */
interface NextRequestLike {
  method: string
  nextUrl?: { searchParams: URLSearchParams }
  url: string
  arrayBuffer(): Promise<ArrayBuffer>
  headers: { get(name: string): string | null }
}

export function nextjsWebhook(wa: WhatsApp): {
  GET: (req: NextRequestLike) => Promise<Response>
  POST: (req: NextRequestLike) => Promise<Response>
} {
  return {
    async GET(req: NextRequestLike): Promise<Response> {
      const params = req.nextUrl?.searchParams ?? new URL(req.url).searchParams
      const mode = params.get('hub.mode') ?? ''
      const token = params.get('hub.verify_token') ?? ''
      const challenge = params.get('hub.challenge') ?? ''
      const result = wa.handleChallenge(mode, token, challenge)
      if (result === null) return new Response('verification failed', { status: 403 })
      return new Response(result, { status: 200 })
    },
    async POST(req: NextRequestLike): Promise<Response> {
      const buf = Buffer.from(await req.arrayBuffer())
      const signature = req.headers.get('x-hub-signature-256') ?? undefined
      const result = await wa.processWebhook(buf, signature)
      return new Response(result.body, { status: result.status })
    },
  }
}
