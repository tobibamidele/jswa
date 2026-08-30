/**
 * adapters/express.ts — Express middleware adapter.
 *
 * Mount with the raw body parser so `req.body` is a `Buffer` — signature
 * validation needs the exact bytes Meta signed, not a re-serialised JSON
 * object (see JSWA_SPEC.md §14).
 */

import type { NextFunction, Request, Response } from 'express'
import type { WhatsApp } from '../client.js'

/**
 * @example
 * ```ts
 * import express from 'express'
 * import { expressWebhook } from 'jswa/adapters/express'
 *
 * const app = express()
 * app.use(wa.webhookEndpoint, express.raw({ type: '*​/*' }), expressWebhook(wa))
 * app.listen(8080)
 * ```
 */
export function expressWebhook(wa: WhatsApp) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.method === 'GET') {
        const mode = String(req.query['hub.mode'] ?? '')
        const token = String(req.query['hub.verify_token'] ?? '')
        const challenge = String(req.query['hub.challenge'] ?? '')
        const result = wa.handleChallenge(mode, token, challenge)
        if (result === null) {
          res.status(403).send('verification failed')
          return
        }
        res.status(200).send(result)
        return
      }

      if (req.method !== 'POST') {
        res.status(405).end()
        return
      }

      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}))
      const signature = req.header('x-hub-signature-256')
      const result = await wa.processWebhook(body, signature)
      res.status(result.status).send(result.body)
    } catch (err) {
      next(err)
    }
  }
}
