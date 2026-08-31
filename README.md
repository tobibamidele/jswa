# jswa

**jswa** is a TypeScript client library for the [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api), written as a faithful port of [gowa](https://github.com/tobibamidele/gowa) (Go), itself modelled on [pywa](https://github.com/david-lev/pywa) (Python).

- **Zero required HTTP dependencies** — uses Node 18+'s native `fetch`.
- **Framework-agnostic webhook core**, with thin adapters for Express, Fastify, Hono, Next.js, TanStack Start, and plain `http`.
- **Full API surface**: messages, media, templates, flows, groups, calling, QR codes, business profile & phone number management, usernames, and more.
- **Type-safe filter predicates** with composable `and` / `or` / `not` combinators.
- **Blocking `waitForReply()`** primitive for building short conversational flows without a state machine.
- **Full JSDoc coverage** on every exported symbol.

---

## Installation

```bash
npm install @tobibamidele/jswa
```

Requires **Node 18+** (uses native `fetch`).

---

## Quick start — sending messages (no webhook)

```ts
import { WhatsApp } from '@tobibamidele/jswa'

const wa = new WhatsApp({
  token: 'YOUR_ACCESS_TOKEN',
  phoneId: 'YOUR_PHONE_NUMBER_ID',
})

const msg = await wa.sendMessage('15551234567', 'Hello from jswa! 👋')
console.log(msg.id)
```

---

## Adapters

Each adapter handles the GET verification challenge and POST webhook dispatch, including raw-body preservation for HMAC signature validation. Use the one that matches your framework — or roll your own with the manual injection pattern at the bottom.

<details>
<summary><strong>Express</strong></summary>

```ts
import express from 'express'
import { WhatsApp, filterText } from '@tobibamidele/jswa'
import { expressWebhook } from '@tobibamidele/jswa/adapters/express'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!,    // enables HMAC signature validation
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

</details>

<details>
<summary><strong>Fastify</strong></summary>

```ts
import Fastify from 'fastify'
import { WhatsApp, filterText } from '@tobibamidele/jswa'
import { fastifyWebhook } from '@tobibamidele/jswa/adapters/fastify'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!,
  verifyToken: process.env.WA_VERIFY_TOKEN!,
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

const app = Fastify()
await app.register(fastifyWebhook(wa))
app.listen({ port: 8080 })
```

</details>

<details>
<summary><strong>Hono</strong></summary>

```ts
import { Hono } from 'hono'
import { WhatsApp, filterText } from '@tobibamidele/jswa'
import { honoWebhook } from '@tobibamidele/jswa/adapters/hono'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!,
  verifyToken: process.env.WA_VERIFY_TOKEN!,
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

const app = new Hono()
honoWebhook(app, wa)
export default app
```

</details>

<details>
<summary><strong>Next.js (App Router)</strong></summary>

Drop this in `app/api/webhook/route.ts`:

```ts
import { WhatsApp, filterText } from '@tobibamidele/jswa'
import { nextjsWebhook } from '@tobibamidele/jswa/adapters/nextjs'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!,
  verifyToken: process.env.WA_VERIFY_TOKEN!,
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

export const { GET, POST } = nextjsWebhook(wa)
```

</details>

<details>
<summary><strong>TanStack Start</strong></summary>

```ts
import { createAPIFileRoute } from '@tanstack/start/api'
import { WhatsApp, filterText } from '@tobibamidele/jswa'
import { tanstackWebhook } from '@tobibamidele/jswa/adapters/tanstack'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!,
  verifyToken: process.env.WA_VERIFY_TOKEN!,
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

const handlers = tanstackWebhook(wa)
export const Route = createAPIFileRoute('/api/webhook')(handlers)
```

</details>

<details>
<summary><strong>Plain Node <code>http</code></strong></summary>

```ts
import { createServer } from 'node:http'
import { WhatsApp, filterText } from '@tobibamidele/jswa'
import { nodeWebhookHandler } from '@tobibamidele/jswa/adapters/node'

const wa = new WhatsApp({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  appSecret: process.env.WA_APP_SECRET!,
  verifyToken: process.env.WA_VERIFY_TOKEN!,
})

wa.onMessage(async (_wa, msg) => {
  await msg.reply(`Echo: ${msg.text}`)
}, filterText)

const handler = nodeWebhookHandler(wa)
createServer((req, res) => {
  if (req.url?.startsWith(wa.webhookEndpoint)) return handler(req, res)
  res.writeHead(404).end()
}).listen(8080)
```

</details>

<details>
<summary><strong>Manual injection (any framework)</strong></summary>

```ts
// Inside your own HTTP handler:
const body = Buffer.from(await req.arrayBuffer())
const signature = req.headers['x-hub-signature-256']
const result = await wa.processWebhook(body, signature)
res.status(result.status).send(result.body)
```

</details>

See `examples/` for complete, runnable versions of each adapter.

---

## Handlers

Every handler receives the `WhatsApp` instance and the typed update:

```ts
wa.onMessage(async (_wa, msg) => {
  await msg.reply('You said: ' + msg.text)
}, filterText)
```

All supported handler types:

```ts
wa.onMessage(...)
wa.onCallbackButton(...)
wa.onCallbackSelection(...)
wa.onMessageStatus(...)
wa.onChatOpened(...)
wa.onFlowCompletion(...)
wa.onPhoneNumberChange(...)
wa.onIdentityChange(...)
wa.onTemplateStatusUpdate(...)
wa.onTemplateCategoryUpdate(...)
wa.onTemplateQualityUpdate(...)
wa.onUserMarketingPreferences(...)
wa.onCallConnect(...)
wa.onCallTerminate(...)
wa.onCallStatus(...)
wa.onCallPermissionUpdate(...)
wa.onRawUpdate(...)          // receives every webhook payload unfiltered
```

Handlers run in priority order (`addMessageHandler(callback, priority, ...filters)`); by default the first fully-matching handler stops dispatch for that update — set `continueHandling: true` in the config to run every matching handler.

### Programmatic handler registration

```ts
wa.addMessageHandler(myHandler, 10 /* priority */, filterText)
wa.removeMessageHandler(myHandler)
```

---

## Filters

Filters are typed predicates `(wa, update) => boolean`. Compose them freely:

```ts
import {
  filterText, filterImage, filterVideo, filterAudio, filterVoice,
  filterDocument, filterSticker, filterLocation, filterContacts,
  filterReaction, filterReply, filterForwarded, filterMedia,
  filterFromWaId, filterTextContains, filterTextPrefix,
  filterCallbackData, filterCallbackPrefix,
  filterStatusSent, filterStatusDelivered, filterStatusRead, filterStatusFailed,
  and, or, not, always, never,
} from '@tobibamidele/jswa'
```

### Message filters

```ts
filterText          // msg.type === 'text' && msg.text !== ''
filterImage
filterVideo
filterAudio
filterVoice         // audio.voice === true
filterDocument
filterSticker
filterLocation
filterContacts
filterReaction
filterReply         // message is a reply or reaction to another message
filterForwarded
filterMedia         // any attachment
```

### Parameterised filters

```ts
filterFromWaId('1234567890')
filterTextContains('hello')
filterTextPrefix('/start')
```

### Callback filters

```ts
filterCallbackData('confirm')
filterCallbackPrefix('action:')
```

### Status filters

```ts
filterStatusSent
filterStatusDelivered
filterStatusRead
filterStatusFailed
```

### Combinators

```ts
and(filterText, filterFromWaId('123'))
or(filterImage, filterVideo)
not(filterForwarded)
always()   // always passes
never()    // always blocks
```

### Custom filter

```ts
const myFilter = (wa: WhatsApp, msg: Message) => {
  return msg.text !== undefined && msg.text.startsWith('!')
}
wa.onMessage(handler, myFilter)
```

---

## Sending messages

### Text

```ts
// Simple text
await wa.sendMessage('1234567890', 'Hello!')

// With link preview
await wa.sendMessage('1234567890', 'Check this out: https://example.com', {
  previewUrl: true,
})

// With quick-reply buttons
await wa.sendMessage('1234567890', 'Choose an option:', {
  buttons: [
    { id: 'yes', title: 'Yes' },
    { id: 'no', title: 'No' },
  ],
})

// With a section list
await wa.sendMessage('1234567890', 'Pick a category:', {
  buttons: {
    buttonText: 'Browse',
    sections: [
      {
        title: 'Food',
        rows: [
          { id: 'pizza', title: 'Pizza', description: 'Cheesy goodness' },
          { id: 'sushi', title: 'Sushi', description: 'Fresh rolls' },
        ],
      },
    ],
  },
})

// Quote a previous message
await wa.sendMessage('1234567890', 'Got it!', {
  replyToMessageId: 'wamid.XXX=',
})

// Tracker for delivery receipts
await wa.sendMessage('1234567890', 'Your order is ready', {
  tracker: 'order:42',
})
```

### Media

```ts
// From URL
await wa.sendImage('1234567890', 'https://example.com/photo.jpg', 'Look at this!')
await wa.sendVideo('1234567890', 'https://example.com/video.mp4', 'Cool video')
await wa.sendDocument('1234567890', 'https://example.com/report.pdf', 'Q3 Report', {
  filename: 'Q3-Report.pdf',
})
await wa.sendAudio('1234567890', 'https://example.com/track.mp3')
await wa.sendVoice('1234567890', 'https://example.com/note.ogg')
await wa.sendSticker('1234567890', 'https://example.com/sticker.webp')

// From local file path
await wa.sendImage('1234567890', '/tmp/photo.png', '')

// From raw Buffer
const data = await readFile('image.jpg')
await wa.sendImage('1234567890', data, 'caption', { mimeType: 'image/jpeg' })

// Image with buttons
await wa.sendImage('1234567890', 'https://example.com/product.jpg', 'Check out this product!', {
  buttons: [
    { id: 'buy', title: 'Buy Now' },
    { id: 'share', title: 'Share' },
  ],
})
```

### Location

```ts
await wa.sendLocation('1234567890', 37.4847, -122.1473, 'WhatsApp HQ', 'Menlo Park, 1601 Willow Rd')

// Ask user to share their location
await wa.requestLocation('1234567890', 'Please share your location to find nearby stores.')
```

### Contact cards

```ts
await wa.sendContact('1234567890', [
  {
    name: { formattedName: 'Jane Doe', firstName: 'Jane' },
    phones: [{ phone: '+1234567890', type: 'MOBILE' }],
    emails: [{ email: 'jane@example.com', type: 'WORK' }],
  },
])
```

### Reactions

```ts
await wa.sendReaction('1234567890', '👍', 'wamid.XXX=')
await wa.removeReaction('1234567890', 'wamid.XXX=')
```

### Templates

```ts
await wa.sendTemplate('1234567890', 'order_confirmation', 'en_US', {
  bodyParams: [{ type: 'text', text: 'ORDER-12345' }],
})
```

### Catalog & products

```ts
// Full catalog
await wa.sendCatalog('1234567890', 'Browse our full catalog!', '', {
  thumbnailProductSku: 'SKU-001',
})

// Single product
await wa.sendProduct('1234567890', 'catalog_id_123', 'SKU-001', {
  body: 'Our best seller!',
})

// Product list
await wa.sendProducts('1234567890', 'catalog_id_123', 'Tech Products', 'Check out our latest gear!', [
  { title: 'Phones', skus: ['IPHONE15', 'PIXEL8'] },
  { title: 'Laptops', skus: ['MBP14', 'DELLXPS'] },
])
```

### Carousel

```ts
await wa.sendCarousel('1234567890', 'Check these out!', [
  { type: 'image', url: 'https://example.com/img1.jpg', buttons: [{ id: 'pick', title: 'Pick' }] },
  { type: 'video', url: 'https://example.com/vid1.mp4' },
])
```

---

## Reply shortcuts on updates

Every handler receives an update with built-in reply helpers:

```ts
wa.onMessage(async (_wa, msg) => {
  await msg.reply('Got your message!')          // quotes the message
  await msg.replyImage('https://...', 'photo')
  await msg.replyDocument('/tmp/file.pdf', 'Report')
  await msg.replyLocation(37.4847, -122.1473, 'HQ', '')
  await msg.react('👍')
  await msg.unreact()
  await msg.markAsRead()
  await msg.indicateTyping()
  await msg.blockSender()
})
```

---

## Conversational flows with `waitForReply()`

Block inside a handler until the user responds — no state machine needed:

```ts
wa.onMessage(async (_wa, msg) => {
  if (msg.text !== '/start') return

  await msg.reply("What's your name?")

  try {
    const reply = await msg.waitForReply(filterText, 30_000)
    await msg.reply('Nice to meet you, ' + reply.text + '!')
  } catch (err) {
    if (err instanceof ListenerTimeout) {
      await msg.reply('You took too long! Try /start again.')
    } else if (err instanceof ListenerCanceled) {
      await msg.reply('Cancelled.')
    }
    throw err
  }
}, filterText)
```

Or use the lower-level `wa.listen()` directly:

```ts
const reply = await wa.listen({
  senderWaId: '1234567890',
  recipientId: 'YOUR_PHONE_ID',
  filter: filterText,
  timeout: 30_000,
})
```

`waitForReply` / `listen` reject with `ListenerTimeout`, `ListenerCanceled`, or `ListenerStopped`.

---

## Media management

```ts
// Upload and reuse
const mediaId = await wa.uploadMedia('https://example.com/image.jpg', '', '', '')
await wa.sendImage('1234567890', mediaId, 'Reused upload')

// Get a short-lived download URL
const mediaUrl = await wa.getMediaUrl('media_id_123')
console.log(mediaUrl.url) // valid for 5 minutes

// Download to disk
await wa.downloadMedia(mediaUrl.url, '/tmp/downloads/')

// Get raw bytes
const data = await wa.getMediaBytes(mediaUrl.url)

// Stream (e.g. proxy to another server)
const stream = await wa.streamMedia(mediaUrl.url)
// stream is a Node.js Readable

// Delete
await wa.deleteMedia('media_id_123')
```

---

## Business profile

```ts
const profile = await wa.getBusinessProfile()
console.log(profile.about)

await wa.updateBusinessProfile({
  about: 'Open Mon–Fri 9am–5pm',
  websites: ['https://example.com'],
})
```

---

## Template management

```ts
// Create
await wa.createTemplate({
  name: 'order_update',
  category: 'UTILITY',
  language: 'en_US',
  components: [{ type: 'BODY', text: 'Your order {{1}} has shipped!' }],
})

// List
const templates = await wa.getTemplates({ status: 'APPROVED', language: 'en_US' })
for (const t of templates.items) {
  console.log(t.name, t.status)
}

// Update
await wa.updateTemplate('template_id', { category: 'MARKETING' })

// Delete
await wa.deleteTemplate('order_update')

// Unpause a pacing-paused template
await wa.unpauseTemplate('template_id')

// Migrate between WABAs
await wa.migrateTemplates('source_waba_id', 0, 'dest_waba_id')
```

---

## Flow management

```ts
// Create a draft flow
const flow = await wa.createFlow('Feedback Survey', ['SURVEY'])

// Upload JSON
await wa.updateFlowJSON(flow.id, { version: '5.0', screens: [...] })

// Publish (irreversible)
await wa.publishFlow(flow.id)

// Deprecate when no longer needed
await wa.deprecateFlow(flow.id)

// Handle flow data-exchange requests
wa.registerFlowEndpoint('/flows/survey', async (wa, req) => {
  console.log('Flow action:', req.action, 'Screen:', req.screen)
  return { screen: 'CONFIRM', data: { name: req.data.name } }
})

// Get metrics
const metrics = await wa.getFlowMetrics(flow.id, 'SENT', 'DAY')
```

---

## QR codes

```ts
// Create
const qr = await wa.createQRCode('Hello! How can I help?', 'PNG')
console.log(qr.qrImageUrl)

// List all
const codes = await wa.getQRCodes('PNG')
for (const c of codes.items) {
  console.log(c.code, c.prefilledMessage)
}

// Update
await wa.updateQRCode(qr.code, 'Updated message')

// Delete
await wa.deleteQRCode(qr.code)
```

---

## User blocking

```ts
const res = await wa.blockUsers(['1234567890', '0987654321'])
console.log(`Blocked ${res.addedUsers.length}, failed ${res.failedUsers.length}`)

await wa.unblockUsers(['0987654321'])

const blocked = await wa.getBlockedUsers(undefined, { limit: 20 })
for (const u of blocked.items) {
  console.log(u.waId)
}
```

---

## Calling

```ts
// Initiate an outbound call
const call = await wa.initiateCall('1234567890', { type: 'offer', sdp: 'v=0\r\n...' })

// Handle inbound calls (inside OnCallConnect handler)
wa.onCallConnect(async (wa, c) => {
  await wa.preAcceptCall(c.callId, { type: 'answer', sdp: '...' }, phoneId)
  await wa.acceptCall(c.callId, { type: 'answer', sdp: '...' }, '', phoneId)
  // or reject:
  await wa.rejectCall(c.callId, phoneId)
})

// Terminate after the call
await wa.terminateCall('call_id_123', phoneId)
```

---

## Groups

```ts
// Create
const group = await wa.createGroup('My Group', {
  description: 'A test group',
  participants: ['1234567890'],
})

// Get details
const details = await wa.getGroup(group.id)

// List groups
const groups = await wa.getGroups()

// Update settings
await wa.updateGroupSettings(group.id, { subject: 'New Name' })

// Manage participants
await wa.removeGroupParticipants(group.id, ['0987654321'])

// Join requests
const requests = await wa.getGroupJoinRequests(group.id)
await wa.approveGroupJoinRequests(group.id, [requests.items[0].requestId])

// Invite link
const link = await wa.getGroupInviteLink(group.id)
await wa.resetGroupInviteLink(group.id)
```

---

## Webhook callback URL management

```ts
// Register the webhook at the app level
const tok = await wa.getAppAccessToken('APP_ID', 'APP_SECRET')
await wa.setAppCallbackURL(12345678, tok, 'https://my-server.com/webhook', 'verify-token', [
  'messages',
  'message_template_status_update',
])

// Override at WABA level
await wa.overrideWABACallbackURL('https://new.example.com/webhook', 'verify-token')

// Override at phone-number level
await wa.overridePhoneCallbackURL('https://new.example.com/webhook', 'verify-token')
```

---

## Error handling

All API errors throw a `WhatsAppError` with the Graph API's error code, message, and (when present) subcode/trace ID:

```ts
import { WhatsAppError, getErrorKind } from '@tobibamidele/jswa'

try {
  await wa.sendMessage(to, 'hi')
} catch (err) {
  if (err instanceof WhatsAppError) {
    console.log(err.code, err.kind) // e.g. 131047 'rateLimit'
    switch (err.kind) {
      case 'rateLimit':
        // retry after backoff
        break
      case 'auth':
        console.error('Token expired or invalid')
        break
    }
  }
}
```

Error kinds: `general`, `auth`, `rateLimit`, `serviceUnavailable`, `invalidParameter`, `permission`, `paymentIssue`, `messageTooLong`, `invalidFormat`, `flowBlocked`, `flowThrottle`, `flowError`.

---

## Configuration reference

```ts
const wa = new WhatsApp({
  // Required for sending
  token: 'EAADKQl9oJxx...',
  phoneId: '123456789',

  // Required for template/flow/group management
  businessAccountId: '987654321',

  // Required for webhook verification challenge
  verifyToken: 'my-secret-verify-token',

  // Required for HMAC signature validation (strongly recommended)
  appSecret: 'abc123...',

  // Required for registering the callback URL at app scope
  appId: '111222333',

  // Webhook path (default: '/webhook')
  webhookEndpoint: '/whatsapp/webhook',

  // Graph API version (default: '22.0')
  apiVersion: '22.0',

  // Drop updates not belonging to this phoneId (default: true)
  filterUpdates: true,

  // Call all matching handlers, not just the first (default: false)
  continueHandling: false,

  // RSA private key PEM for Flow end-to-end decryption (optional)
  businessPrivateKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
  businessPrivateKeyPassword: '',

  // Custom fetch implementation (for testing, proxies, etc.)
  fetch: myCustomFetch,
})
```

---

## Raw API access

For anything not yet wrapped, drop to the raw layer:

```ts
await wa.sendRawRequest('GET', '/some/unwrapped/endpoint')
// or, for the underlying HTTP client directly:
await wa.rawApi.get('/some/endpoint')
```

---

## pywa / gowa → jswa API mapping

| pywa / gowa | jswa |
|-------------|------|
| `WhatsApp(phone_id=..., token=...)` | `new WhatsApp({ phoneId, token })` |
| `@wa.on_message(filters.text)` | `wa.onMessage(fn, filterText)` |
| `@wa.on_callback_button` | `wa.onCallbackButton(fn)` |
| `filters.text & filters.reply` | `and(filterText, filterReply)` |
| `filters.text \| filters.image` | `or(filterText, filterImage)` |
| `~filters.forwarded` | `not(filterForwarded)` |
| `wa.send_message(to, text)` | `wa.sendMessage(to, text)` |
| `msg.reply("hi")` | `msg.reply("hi")` |
| `msg.react("👍")` | `msg.react("👍")` |
| `wa.listen(to=..., timeout=30)` | `wa.listen({ senderWaId, timeout: 30_000 })` |
| `msg.WaitForReply(wa, filter, 30s)` | `msg.waitForReply(filter, 30_000)` |
| `*gowa.ListenerTimeout` | `ListenerTimeout` |
| `*gowa.WhatsAppError` | `WhatsAppError` |

---

## Development

```bash
npm install
npm run build      # tsup -> dist/
npm run typecheck  # tsc --noEmit
npm run lint
```

## License

MIT
