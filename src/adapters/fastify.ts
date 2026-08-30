/**
 * adapters/fastify.ts — Fastify plugin adapter.
 *
 * Registers a `contentTypeParser` for `application/json` that preserves the
 * raw bytes (needed for signature validation), then wires GET/POST handlers
 * at `wa.webhookEndpoint`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { WhatsApp } from '../client.js'

interface WithRawBody {
  rawBody?: Buffer
}

/**
 * @example
 * ```ts
 * import Fastify from 'fastify'
 * import { fastifyWebhook } from 'jswa/adapters/fastify'
 *
 * const app = Fastify()
 * await app.register(fastifyWebhook(wa))
 * app.listen({ port: 8080 })
 * ```
 */
export function fastifyWebhook(wa: WhatsApp) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
      ;(req as FastifyRequest & WithRawBody).rawBody = body as Buffer
      done(null, body)
    })

    app.get(wa.webhookEndpoint, async (req: FastifyRequest, reply: FastifyReply) => {
      const q = req.query as Record<string, string>
      const result = wa.handleChallenge(q['hub.mode'] ?? '', q['hub.verify_token'] ?? '', q['hub.challenge'] ?? '')
      if (result === null) return reply.status(403).send('verification failed')
      return reply.status(200).send(result)
    })

    app.post(wa.webhookEndpoint, async (req: FastifyRequest, reply: FastifyReply) => {
      const body = (req as FastifyRequest & WithRawBody).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))
      const signature = req.headers['x-hub-signature-256']
      const result = await wa.processWebhook(body, typeof signature === 'string' ? signature : undefined)
      return reply.status(result.status).send(result.body)
    })
  }
}
