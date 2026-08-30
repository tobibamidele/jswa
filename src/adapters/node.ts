/**
 * adapters/node.ts — plain Node.js `http`/`https` server adapter.
 *
 * No framework dependency. Use this if you're calling `http.createServer`
 * directly, or building your own adapter for a framework not covered here.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WhatsApp } from '../client.js'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Returns a request handler you can mount at `wa.webhookEndpoint`
 * (default `/webhook`) in a plain `http.createServer` callback.
 *
 * @example
 * ```ts
 * import { createServer } from 'node:http'
 * import { nodeWebhookHandler } from 'jswa/adapters/node'
 *
 * const handler = nodeWebhookHandler(wa)
 * createServer((req, res) => {
 *   if (req.url?.startsWith(wa.webhookEndpoint)) return handler(req, res)
 *   res.writeHead(404).end()
 * }).listen(8080)
 * ```
 */
export function nodeWebhookHandler(wa: WhatsApp) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost')
      const mode = url.searchParams.get('hub.mode') ?? ''
      const token = url.searchParams.get('hub.verify_token') ?? ''
      const challenge = url.searchParams.get('hub.challenge') ?? ''
      const result = wa.handleChallenge(mode, token, challenge)
      if (result === null) {
        res.writeHead(403).end('verification failed')
        return
      }
      res.writeHead(200).end(result)
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }

    const body = await readBody(req)
    const signature = req.headers['x-hub-signature-256']
    const result = await wa.processWebhook(body, typeof signature === 'string' ? signature : undefined)
    res.writeHead(result.status).end(result.body)
  }
}
