/**
 * examples/express-bot.ts
 *
 * A minimal Express echo/menu bot demonstrating handlers, filters, and reply
 * shortcuts. Run with: `npx tsx examples/express-bot.ts`
 */

import express from 'express'
import { WhatsApp, filterText, filterImage, filterCallbackData, and, filterTextPrefix } from '../src/index.js'
import { expressWebhook } from '../src/adapters/express.js'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET,
  verifyToken: process.env.WA_VERIFY_TOKEN,
})

// Reply to any text message that isn't a command.
wa.onMessage(
  async (_wa, msg) => {
    await msg.reply(`You said: ${msg.text}`)
  },
  and(filterText, (_wa, m) => !m.text?.startsWith('/')),
)

// Slash command: show an interactive menu.
wa.onMessage(
  async (_wa, msg) => {
    await msg.reply('What would you like to do?', {
      buttons: [
        { id: 'menu:hours', title: 'Opening hours' },
        { id: 'menu:location', title: 'Location' },
        { id: 'menu:human', title: 'Talk to a human' },
      ],
    })
  },
  filterTextPrefix('/menu'),
)

wa.onCallbackButton(async (_wa, cb) => {
  await cb.reply(`You picked: ${cb.title}`)
}, filterCallbackData('menu:hours'))

// React to any incoming image with a thumbs-up.
wa.onMessage(async (_wa, msg) => {
  await msg.react('👍')
}, filterImage)

const app = express()
app.use(wa.webhookEndpoint, express.raw({ type: '*/*' }), expressWebhook(wa))
app.listen(8080, () => console.log('jswa Express bot listening on :8080'))
