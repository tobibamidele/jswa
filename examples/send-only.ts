/**
 * examples/send-only.ts
 *
 * Demonstrates API-only usage (no webhook needed) — sending a text message,
 * an image, and a template. Run with: `npx tsx examples/send-only.ts`
 */

import { WhatsApp } from '../src/index.js'

async function main() {
  const wa = new WhatsApp({
    token: process.env.WA_TOKEN!,
    phoneId: process.env.WA_PHONE_ID!,
  })

  const to = process.env.WA_TEST_RECIPIENT!

  const text = await wa.sendMessage(to, 'Hello from jswa! 👋')
  console.log('sent text:', text.id)

  const img = await wa.sendImage(to, 'https://picsum.photos/400', 'A random photo')
  console.log('sent image:', img.id)

  const tmpl = await wa.sendTemplate(to, 'hello_world', 'en_US')
  console.log('sent template:', tmpl.id)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
