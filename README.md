# jswa

A TypeScript client for the WhatsApp Cloud API — a faithful port of
[gowa](https://github.com/tobibamidele/gowa) (Go), itself modelled on
[pywa](https://github.com/david-lev/pywa) (Python).

- **Zero required HTTP dependencies** — uses Node 18+'s native `fetch`.
- **Framework-agnostic webhook core**, with thin adapters for Express,
  Fastify, Hono, Next.js, TanStack Start, and plain `http`.
- **Full API surface**: messages, media, templates, flows, groups, calling,
  QR codes, business profile & phone number management, usernames, and more.
- **Filters + handlers**, matching gowa/pywa's ergonomics, plus a
  `msg.waitForReply()` primitive for building short conversational flows
  without a state machine.

## Install

```bash
npm install jswa
```

## Quick start — sending only (no webhook)

```ts
import { WhatsApp } from 'jswa'

const wa = new WhatsApp({ token: 'YOUR_TOKEN', phoneId: 'YOUR_PHONE_ID' })

const msg = await wa.sendMessage('15551234567', 'Hello from jswa! 👋')
console.log(msg.id)
```

## Quick start — with a webhook (Express)

```ts
import express from 'express'
import { WhatsApp, filterText } from 'jswa'
import { expressWebhook } from 'jswa/adapters/express'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!, // for signature validation
  verifyToken: process.env.WA_VERIFY_TOKEN!, // for the GET challenge
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

const app = express()
// IMPORTANT: use express.raw() here, not express.json() — signature
// validation needs the exact bytes Meta signed.
app.use(wa.webhookEndpoint, express.raw({ type: '*/*' }), expressWebhook(wa))
app.listen(8080)
```

Other frameworks: `jswa/adapters/fastify`, `jswa/adapters/hono`,
`jswa/adapters/nextjs`, `jswa/adapters/tanstack`, or `jswa/adapters/node` for
a plain `http.createServer`. See `examples/` for complete, runnable versions
of each.

## Filters & handlers

```ts
import { filterText, filterImage, filterTextPrefix, and, or, not } from 'jswa'

wa.onMessage(async (_wa, msg) => { await msg.react('👍') }, filterImage)

wa.onMessage(
  async (_wa, msg) => { await msg.reply('...') },
  and(filterText, filterTextPrefix('/order')),
)
```

Handlers run in priority order (`addMessageHandler(cb, priority, ...filters)`);
by default the first fully-matching handler stops dispatch for that update —
set `continueHandling: true` in the config to run every matching handler.

## Conversational flows with `listen()`

```ts
wa.onMessage(async (_wa, msg) => {
  if (msg.text !== '/order') return
  await msg.reply('What size? (small/medium/large)')
  const sizeReply = await msg.waitForReply(filterText, 60_000) // 60s timeout
  await msg.reply(`Ordering a ${sizeReply.text} pizza!`)
}, filterText)
```

`waitForReply` (and the lower-level `wa.listen()`) reject with
`ListenerTimeout`, `ListenerCanceled`, or `ListenerStopped` — catch these to
handle the unhappy paths.

## Media

```ts
// URL, local file path, or raw Buffer are all accepted:
await wa.sendImage(to, 'https://example.com/photo.jpg', 'Caption')
await wa.sendImage(to, './local/photo.png', 'Caption')
await wa.sendImage(to, buffer, 'Caption', { mimeType: 'image/png' })

const url = await wa.getMediaUrl(mediaId)
await wa.downloadMedia(url.url, './downloaded.jpg')
```

## Templates, Flows, Groups

The client covers the full Cloud API management surface — template
CRUD/archival, Flow CRUD/publish/metrics, group creation/participants/join
requests, QR codes, calling, business profile & phone number provisioning,
usernames, and WABA/portfolio management. See the generated type
definitions (`dist/index.d.ts`) or `src/client.ts` for the full method list —
every method mirrors gowa's Go method of the same purpose (see
`JSWA_SPEC.md` for the full mapping table this port was built from).

For anything not yet wrapped, drop to the raw layer:

```ts
await wa.sendRawRequest('GET', '/some/unwrapped/endpoint')
// or, for the underlying HTTP client directly:
await wa.rawApi.get('/some/endpoint')
```

## Error handling

Every failed API call throws a `WhatsAppError` with the Graph API's error
code, message, and (when present) subcode/trace ID:

```ts
import { WhatsAppError, getErrorKind } from 'jswa'

try {
  await wa.sendMessage(to, 'hi')
} catch (err) {
  if (err instanceof WhatsAppError) {
    console.log(err.code, err.kind) // e.g. 131047 'rateLimit'
  }
}
```

## WhatsApp Flows (data exchange endpoint)

```ts
wa.registerFlowEndpoint('/flow-endpoint', async (wa, req) => {
  // req is already decrypted by the adapter using businessPrivateKey
  return { screen: 'SUCCESS', data: { message: 'Thanks!' } }
})
```

Configure `businessPrivateKey` (RSA PEM) in the `WhatsApp` config; the Node
adapter (`adapters/node.ts`) is the place to add the RSA-OAEP + AES-GCM
decrypt/encrypt implementation Meta's Flow protocol requires for your
deployment.

## Development

```bash
npm install
npm run build      # tsup -> dist/
npm run typecheck  # tsc --noEmit
npm run lint
```

## License

MIT
