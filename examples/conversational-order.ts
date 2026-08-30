/**
 * examples/conversational-order.ts
 *
 * Demonstrates `msg.waitForReply()` / `wa.listen()` to build a short
 * multi-turn conversation (a naive pizza order flow) without a state
 * machine — each step just awaits the next reply from the same user.
 */

import { WhatsApp, filterText, ListenerTimeout } from '../src/index.js'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET,
  verifyToken: process.env.WA_VERIFY_TOKEN,
})

wa.onMessage(
  async (_wa, msg) => {
    if (msg.text?.trim().toLowerCase() !== '/order') return

    await msg.reply("What size pizza would you like? (small / medium / large)")
    let size: string
    try {
      const sizeReply = await msg.waitForReply(filterText, 60_000)
      size = sizeReply.text!
    } catch (err) {
      if (err instanceof ListenerTimeout) {
        await msg.reply("No response in time — send /order to start again.")
        return
      }
      throw err
    }

    await msg.reply(`Got it, a ${size} pizza. What toppings?`)
    const toppingsReply = await msg.waitForReply(filterText, 60_000).catch(() => null)
    if (!toppingsReply) {
      await msg.reply('No response in time — send /order to start again.')
      return
    }

    await msg.reply(`Order confirmed: ${size} pizza with ${toppingsReply.text}. Thanks!`)
  },
  filterText,
)
