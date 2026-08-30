/**
 * adapters/hono.ts — Hono route adapter.
 *
 * Hono runs on Node, Bun, Deno, and Cloudflare Workers, so this adapter
 * takes the raw bytes via `c.req.arrayBuffer()` rather than any Node-specific
 * body parsing.
 */

import type { Context, Hono } from 'hono'
import type { WhatsApp } from '../client.js'

/**
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { honoWebhook } from 'jswa/adapters/hono'
 *
 * const app = new Hono()
 * honoWebhook(app, wa)
 * export default app
 * ```
 */
export function honoWebhook(app: Hono, wa: WhatsApp): void {
  app.get(wa.webhookEndpoint, (c: Context) => {
    const mode = c.req.query('hub.mode') ?? ''
    const token = c.req.query('hub.verify_token') ?? ''
    const challenge = c.req.query('hub.challenge') ?? ''
    const result = wa.handleChallenge(mode, token, challenge)
    if (result === null) return c.text('verification failed', 403)
    return c.text(result, 200)
  })

  app.post(wa.webhookEndpoint, async (c: Context) => {
    const buf = Buffer.from(await c.req.arrayBuffer())
    const signature = c.req.header('x-hub-signature-256')
    const result = await wa.processWebhook(buf, signature)
    return c.text(result.body, result.status as never)
  })
}
