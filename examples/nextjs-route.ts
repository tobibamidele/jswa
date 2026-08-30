/**
 * examples/nextjs-route.ts
 *
 * Drop this in `app/api/webhook/route.ts` in a Next.js App Router project.
 */

import { WhatsApp, filterText } from '../src/index.js'
import { nextjsWebhook } from '../src/adapters/nextjs.js'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET,
  verifyToken: process.env.WA_VERIFY_TOKEN,
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

export const { GET, POST } = nextjsWebhook(wa)
