# jswa — TypeScript WhatsApp Cloud API SDK
## Complete Porting Specification for a New Claude Session

---

## 0. Mission

Port the **WhatsApp Cloud API client** to TypeScript as `jswa`, published at
`github.com/tobibamidele/jswa`.

This is the third implementation of the same client:
- **pywa** (Python, original) — `github.com/david-lev/pywa` — the reference implementation
- **gowa** (Go, already complete) — `github.com/tobibamidele/gowa` — a faithful Go port
- **jswa** (TypeScript, your task) — `github.com/tobibamidele/jswa` — this port

**Use gowa as your primary reference**, not pywa. gowa's architecture is already
language-neutral (no decorators, no async magic, clean interfaces) and its naming
maps almost 1:1 to idiomatic TypeScript. Clone both for reference:

```bash
git clone https://github.com/tobibamidele/gowa.git
git clone https://github.com/david-lev/pywa.git   # for edge cases only
git clone https://github.com/tobibamidele/jswa.git # your output
```

---

## 1. Project identity

| Field | Value |
|-------|-------|
| Package name | `jswa` |
| npm package | `jswa` |
| GitHub | `github.com/tobibamidele/jswa` |
| Language | TypeScript (strict mode, no `any` unless absolutely unavoidable) |
| Node target | Node.js 18+ (uses `node:http`, `node:crypto`, `node:stream`) |
| Module format | ESM primary, CJS secondary (dual package via `tsup`) |
| Runtime | Node.js only — no Deno/Bun shims required but keep them possible |

---

## 2. Reference source files to clone and read

Read these files from gowa in full before writing a single line of TypeScript.
The architecture, type names, method signatures, and doc comments are the spec.

```
gowa/
├── errors.go           → src/errors.ts
├── types.go            → src/types.ts
├── types_group.go      → src/types.ts  (append)
├── update.go           → src/update.ts
├── filters.go          → src/filters.ts
├── handlers.go         → src/handlers.ts
├── api.go              → src/api.ts
├── api_v2.go           → src/api.ts    (append)
├── webhook.go          → src/webhook.ts
├── client.go           → src/client.ts
├── client_extended.go  → src/client.ts (append)
├── client_remaining.go → src/client.ts (append)
├── client_v2.go        → src/client.ts (append)
├── listeners.go        → src/listeners.ts
└── reply_shortcuts.go  → src/update.ts (append)
```

---

## 3. Repository layout

```
jswa/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── .eslintrc.json
├── src/
│   ├── index.ts          ← barrel — re-exports everything public
│   ├── errors.ts         ← WhatsAppError, ErrorKind
│   ├── types.ts          ← all value types (User, Message, Media, Button…)
│   ├── update.ts         ← BaseUpdate class, Message class, reply shortcuts
│   ├── filters.ts        ← Filter<T> type, all built-in predicates
│   ├── handlers.ts       ← handler registration internals
│   ├── api.ts            ← GraphAPI class (raw node:http fetch wrapper)
│   ├── webhook.ts        ← signature validation, update parsing, routing
│   ├── listeners.ts      ← blocking listen() / stopListening()
│   ├── client.ts         ← WhatsApp class — the public API surface
│   └── adapters/
│       ├── node.ts       ← raw node:http server
│       ├── express.ts    ← Express 4/5 middleware
│       ├── fastify.ts    ← Fastify plugin
│       ├── hono.ts       ← Hono middleware
│       ├── nextjs.ts     ← Next.js App Router route handler
│       └── tanstack.ts   ← TanStack Start server function
├── examples/
│   ├── basic-node.ts
│   ├── express-app.ts
│   ├── fastify-app.ts
│   ├── hono-app.ts
│   └── nextjs-app.ts
└── README.md
```

---

## 4. package.json

```json
{
  "name": "jswa",
  "version": "1.0.0",
  "description": "TypeScript client for the WhatsApp Cloud API",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./adapters/express": {
      "import": "./dist/adapters/express.js",
      "require": "./dist/adapters/express.cjs",
      "types": "./dist/adapters/express.d.ts"
    },
    "./adapters/fastify": {
      "import": "./dist/adapters/fastify.js",
      "require": "./dist/adapters/fastify.cjs",
      "types": "./dist/adapters/fastify.d.ts"
    },
    "./adapters/hono": {
      "import": "./dist/adapters/hono.js",
      "require": "./dist/adapters/hono.cjs",
      "types": "./dist/adapters/hono.d.ts"
    },
    "./adapters/nextjs": {
      "import": "./dist/adapters/nextjs.js",
      "require": "./dist/adapters/nextjs.cjs",
      "types": "./dist/adapters/nextjs.d.ts"
    },
    "./adapters/tanstack": {
      "import": "./dist/adapters/tanstack.js",
      "require": "./dist/adapters/tanstack.cjs",
      "types": "./dist/adapters/tanstack.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "peerDependencies": {
    "express": ">=4.0.0",
    "fastify": ">=4.0.0",
    "hono": ">=4.0.0",
    "next": ">=14.0.0",
    "@tanstack/start": ">=1.0.0"
  },
  "peerDependenciesMeta": {
    "express": { "optional": true },
    "fastify": { "optional": true },
    "hono": { "optional": true },
    "next": { "optional": true },
    "@tanstack/start": { "optional": true }
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "fastify": "^4.28.0",
    "hono": "^4.4.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

---

## 5. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "examples"]
}
```

---

## 6. tsup.config.ts

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/node': 'src/adapters/node.ts',
    'adapters/express': 'src/adapters/express.ts',
    'adapters/fastify': 'src/adapters/fastify.ts',
    'adapters/hono': 'src/adapters/hono.ts',
    'adapters/nextjs': 'src/adapters/nextjs.ts',
    'adapters/tanstack': 'src/adapters/tanstack.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
})
```

---

## 7. Key translation decisions — Go → TypeScript

### 7.1 Async everywhere

Every method that calls the Graph API is `async` and returns a `Promise<T>`.
Listeners use `async/await` with proper `AbortSignal` or `Promise` + resolve/reject.

```ts
// Go:   func (wa *WhatsApp) SendMessage(to, text string, opts ...SendMessageOptions) (*SentMessage, error)
// TS:   async sendMessage(to: string, text: string, opts?: SendMessageOptions): Promise<SentMessage>
```

### 7.2 Error handling — exceptions not tuples

Go returns `(value, error)`. TypeScript throws. Use a custom error class:

```ts
// src/errors.ts
export class WhatsAppError extends Error {
  readonly code: number
  readonly message: string
  readonly details?: string
  readonly fbTraceId?: string
  readonly href?: string
  readonly subcode?: number
  readonly type?: string
  readonly isTransient?: boolean
  readonly userTitle?: string
  readonly userMsg?: string
  readonly statusCode?: number

  constructor(data: WhatsAppErrorData) { ... }
}

export type ErrorKind =
  | 'general' | 'auth' | 'rateLimit' | 'serviceUnavailable'
  | 'invalidParameter' | 'permission' | 'paymentIssue'
  | 'messageTooLong' | 'invalidFormat' | 'flowBlocked'
  | 'flowThrottle' | 'flowError'

export function getErrorKind(code: number): ErrorKind { ... }
```

### 7.3 Optional parameters — options objects not variadic

Go uses variadic option structs. TypeScript uses optional objects:

```ts
// SendMessageOptions in TypeScript
interface SendMessageOptions {
  previewUrl?: boolean
  replyToMessageId?: string
  tracker?: string
  identityKeyHash?: string
  sender?: string
  header?: string
  footer?: string
  buttons?: Button[] | URLButton | SectionList | FlowButton
}
```

### 7.4 Filters — typed function predicates

Go's `Filter[T]` generic maps directly to TypeScript generics:

```ts
// src/filters.ts
export type Filter<T> = (wa: WhatsApp, update: T) => boolean

export function and<T>(...filters: Filter<T>[]): Filter<T> {
  return (wa, update) => filters.every(f => f(wa, update))
}

export function or<T>(...filters: Filter<T>[]): Filter<T> {
  return (wa, update) => filters.some(f => f(wa, update))
}

export function not<T>(filter: Filter<T>): Filter<T> {
  return (wa, update) => !filter(wa, update)
}

// Built-ins:
export const filterText: Filter<Message> = (_, msg) =>
  msg.type === 'text' && !!msg.text

export const filterImage: Filter<Message> = (_, msg) =>
  msg.type === 'image' && !!msg.image

// ... all others from gowa/filters.go
```

### 7.5 Handlers — callbacks not decorators

Python's `@wa.on_message(filters.text)` decorator becomes a method call.
Go already did this translation. TypeScript follows Go exactly:

```ts
wa.onMessage(async (wa, msg) => {
  await msg.reply('Hello!')
}, filterText)

wa.onCallbackButton(async (wa, cb) => {
  console.log(cb.data)
}, filterCallbackData('confirm'))
```

Internally, use a priority-sorted array of `HandlerEntry<T>` objects.
Each entry has `callback`, `filters[]`, and `priority`.

```ts
// src/handlers.ts
interface HandlerEntry<T> {
  callback: (wa: WhatsApp, update: T) => Promise<void> | void
  filters: Filter<T>[]
  priority: number
}

class HandlerList<T> {
  private handlers: HandlerEntry<T>[] = []

  add(entry: HandlerEntry<T>): void {
    this.handlers.push(entry)
    this.handlers.sort((a, b) => b.priority - a.priority)
  }

  async dispatch(wa: WhatsApp, update: T): Promise<void> {
    for (const h of this.handlers) {
      if (h.filters.every(f => f(wa, update))) {
        await h.callback(wa, update)
        if (!wa.continueHandling) return
      }
    }
  }
}
```

### 7.6 Go's `io.ReadCloser` → Node.js `Readable`

```ts
// StreamMedia returns a Node.js Readable stream
async streamMedia(mediaUrl: string): Promise<Readable>
```

### 7.7 Go's `Result[T]` → async iterable + page object

```ts
interface Result<T> {
  items: T[]
  totalCount?: number
  nextCursor?: string
  prevCursor?: string
  hasNextPage(): boolean
  nextPage(): Promise<Result<T>>
}
```

### 7.8 Go's `Listen()` → `Promise` with AbortSignal

```ts
// src/listeners.ts
interface ListenOptions {
  senderWaId: string
  recipientId?: string
  filter?: Filter<Message>
  canceler?: Filter<Message>
  timeout?: number  // milliseconds
  signal?: AbortSignal
}

// Returns the first matching Message
async listen(opts: ListenOptions): Promise<Message>

// Rejects with:
class ListenerTimeout extends Error { duration: number }
class ListenerCanceled extends Error { update?: Message }
class ListenerStopped extends Error { reason?: string }
```

### 7.9 Go's `[]byte` → `Buffer | Uint8Array`

Anywhere Go uses `[]byte` for media data, TypeScript uses `Buffer | Uint8Array`.

### 7.10 Go pointer receivers on update types → class methods

`BaseUserUpdate` in Go embeds shortcut methods. In TypeScript, make it a class:

```ts
// src/update.ts
export class BaseUpdate {
  readonly id: string
  readonly metadata: Metadata
  readonly from: User
  readonly timestamp: Date

  // These are set during construction — not in the constructor signature
  /** @internal */ _client!: WhatsApp

  async markAsRead(): Promise<void> {
    await this._client.markMessageAsRead(this.id)
  }

  async indicateTyping(): Promise<void> {
    await this._client.indicateTyping(this.id)
  }

  async react(emoji: string): Promise<SentReaction> {
    return this._client.sendReaction(this.from.waId, emoji, this.id)
  }

  async unreact(): Promise<SentReaction> {
    return this._client.removeReaction(this.from.waId, this.id)
  }

  async reply(text: string, opts?: Omit<SendMessageOptions, 'replyToMessageId' | 'sender'>): Promise<SentMessage> {
    return this._client.sendMessage(this.from.waId, text, {
      ...opts,
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  async replyImage(image: string | Buffer, caption?: string, opts?: ...): Promise<SentMediaMessage>
  async replyVideo(video: string | Buffer, caption?: string, opts?: ...): Promise<SentMediaMessage>
  async replyDocument(doc: string | Buffer, caption?: string, opts?: ...): Promise<SentMediaMessage>
  async replyAudio(audio: string | Buffer, opts?: ...): Promise<SentMediaMessage>
  async replyVoice(voice: string | Buffer, opts?: ...): Promise<SentMediaMessage>
  async replySticker(sticker: string | Buffer, opts?: ...): Promise<SentMediaMessage>
  async replyLocation(lat: number, lng: number, name?: string, address?: string): Promise<SentMessage>
  async replyContact(contacts: Contact[]): Promise<SentMessage>
  async replyTemplate(name: string, language: string, opts?: ...): Promise<SentTemplate>
  async blockSender(): Promise<void>

  async waitForReply(filter?: Filter<Message>, timeoutMs?: number): Promise<Message> {
    return this._client.listen({
      senderWaId: this.from.waId,
      recipientId: this.metadata.phoneNumberId,
      filter,
      timeout: timeoutMs,
    })
  }
}

export class Message extends BaseUpdate {
  readonly type: MessageType
  readonly replyToMessage?: ReplyToMessage
  readonly forwarded: boolean
  readonly forwardedManyTimes: boolean

  // Exactly one of these is set, matching the type field
  readonly text?: string
  readonly image?: Image
  readonly video?: Video
  readonly audio?: Audio
  readonly document?: Document
  readonly sticker?: Sticker
  readonly reaction?: Reaction
  readonly location?: Location
  readonly contacts?: Contact[]
  readonly order?: Order
  readonly referral?: Referral
  readonly error?: WhatsAppError

  get voice(): Audio | undefined { return this.audio?.voice ? this.audio : undefined }
  get hasMedia(): boolean { ... }
  get isReply(): boolean { ... }
  get caption(): string | undefined { ... }
}
```

---

## 8. src/api.ts — GraphAPI class

Use **`node:https`** (or the native `fetch` available in Node 18+) for all HTTP.
**Recommend using native `fetch`** (available since Node 18) — no dependencies.

```ts
// src/api.ts
export class GraphAPI {
  private readonly baseUrl: string
  private token: string
  private readonly fetchImpl: typeof fetch

  constructor(token: string, version = '22.0', fetchImpl?: typeof fetch) {
    this.token = token
    this.baseUrl = `https://graph.facebook.com/v${version}`
    this.fetchImpl = fetchImpl ?? globalThis.fetch
  }

  private async request<T = Record<string, unknown>>(
    method: string,
    endpoint: string,
    opts?: {
      params?: Record<string, string>
      body?: unknown
      formData?: FormData
    }
  ): Promise<T> {
    // Build URL, add Authorization header, handle JSON / FormData bodies,
    // decode response, throw WhatsAppError on error status
  }

  // Media upload uses FormData with the MIME type set correctly on the file part.
  // CRITICAL: do NOT use a plain string Content-Type on the body — set it on
  // the FormData file part. In Node fetch, this is done via:
  //   const blob = new Blob([fileData], { type: mimeType })
  //   formData.append('file', blob, filename)
  // The Blob carries the MIME type onto the part header automatically.
  // This is the same bug that was fixed in gowa (CreateFormFile → CreatePart).
  async uploadMedia(phoneId: string, fileData: Buffer, mimeType: string, filename: string): Promise<string> {
    const formData = new FormData()
    formData.append('messaging_product', 'whatsapp')
    formData.append('type', mimeType)
    const blob = new Blob([fileData], { type: mimeType })  // type on the Blob = Content-Type on the part
    formData.append('file', blob, filename)
    const res = await this.request<{ id: string }>('POST', `/${phoneId}/media`, { formData })
    return res.id
  }

  // All other methods mirror gowa/api.go and gowa/api_v2.go exactly —
  // translate each Go method 1:1 to an async TypeScript method.
  // Method names: camelCase (sendMessage, getMediaUrl, createGroup, etc.)
}
```

---

## 9. src/webhook.ts

### Signature validation

```ts
// src/webhook.ts
import { createHmac } from 'node:crypto'

export function validateSignature(appSecret: string, body: Buffer, sigHeader: string): boolean {
  const sig = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader
  const expected = createHmac('sha256', appSecret).update(body).digest('hex')
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
```

### Update routing

The webhook dispatcher is the most complex part. Translate `webhook.go` fully.
Key function signatures:

```ts
class WebhookProcessor {
  constructor(private readonly wa: WhatsApp) {}

  // Main entry point — called by every adapter
  async process(body: Buffer, signature?: string): Promise<{ status: number; body: string }> { ... }

  // Challenge handler (GET requests)
  handleChallenge(mode: string, token: string, challenge: string): string | null { ... }

  private async dispatchUpdate(raw: RawUpdate): Promise<void> { ... }
  private async dispatchMessagesField(value: Record<string, unknown>): Promise<void> { ... }
  private async dispatchMessage(meta: Metadata, msg: Record<string, unknown>, value: Record<string, unknown>): Promise<void> { ... }
  private async dispatchStatus(meta: Metadata, status: Record<string, unknown>): Promise<void> { ... }
}
```

---

## 10. src/client.ts — WhatsApp class

```ts
export interface Config {
  token: string
  phoneId: string
  businessAccountId?: string
  appId?: string
  appSecret?: string
  verifyToken?: string
  webhookEndpoint?: string       // default: '/webhook'
  apiVersion?: string            // default: '22.0'
  filterUpdates?: boolean        // default: true
  continueHandling?: boolean     // default: false
  validateUpdates?: boolean      // default: true
  businessPrivateKey?: string    // for Flow decryption
  fetch?: typeof globalThis.fetch // custom fetch implementation
}

export class WhatsApp {
  readonly phoneId: string
  readonly businessAccountId?: string
  readonly continueHandling: boolean

  // All 116 methods from gowa — async, camelCase names:
  async sendMessage(to: string, text: string, opts?: SendMessageOptions): Promise<SentMessage>
  async sendText(to: string, text: string, opts?: SendMessageOptions): Promise<SentMessage>
  async sendImage(to: string, image: string | Buffer, caption?: string, opts?: SendMediaOptions): Promise<SentMediaMessage>
  async sendVideo(to: string, video: string | Buffer, caption?: string, opts?: SendMediaOptions): Promise<SentMediaMessage>
  async sendDocument(to: string, doc: string | Buffer, caption?: string, opts?: SendMediaOptions): Promise<SentMediaMessage>
  async sendAudio(to: string, audio: string | Buffer, opts?: SendMediaOptions): Promise<SentMediaMessage>
  async sendVoice(to: string, voice: string | Buffer, opts?: SendMediaOptions): Promise<SentMediaMessage>
  async sendSticker(to: string, sticker: string | Buffer, opts?: SendMediaOptions): Promise<SentMediaMessage>
  async sendReaction(to: string, emoji: string, messageId: string, opts?: SendReactionOptions): Promise<SentReaction>
  async removeReaction(to: string, messageId: string, opts?: RemoveReactionOptions): Promise<SentReaction>
  async sendLocation(to: string, lat: number, lng: number, name?: string, address?: string, opts?: SendLocationOptions): Promise<SentMessage>
  async requestLocation(to: string, text: string, opts?: SendLocationOptions): Promise<SentLocationRequest>
  async requestContactInfo(to: string, text: string, opts?: RequestContactInfoOptions): Promise<SentContactInfoRequest>
  async sendContact(to: string, contacts: Contact[], opts?: SendContactOptions): Promise<SentMessage>
  async sendCatalog(to: string, body: string, footer?: string, opts?: SendCatalogOptions): Promise<SentMessage>
  async sendProduct(to: string, catalogId: string, sku: string, opts?: SendProductOptions): Promise<SentMessage>
  async sendProducts(to: string, catalogId: string, title: string, body: string, sections: ProductsSection[], opts?: SendProductsOptions): Promise<SentMessage>
  async sendCarousel(to: string, body: string, cards: CarouselCard[], opts?: SendCarouselOptions): Promise<SentMessage>
  async sendTemplate(to: string, name: string, language: string, opts?: SendTemplateOptions): Promise<SentTemplate>
  async markMessageAsRead(messageId: string, sender?: string): Promise<void>
  async indicateTyping(messageId: string, sender?: string): Promise<void>
  async uploadMedia(media: string | Buffer, mimeType?: string, filename?: string, phoneId?: string): Promise<string>
  async getMediaUrl(mediaId: string): Promise<MediaURL>
  async downloadMedia(mediaUrl: string, destPath: string): Promise<string>
  async getMediaBytes(mediaUrl: string): Promise<Buffer>
  async streamMedia(mediaUrl: string): Promise<import('node:stream').Readable>
  async deleteMedia(mediaId: string, phoneId?: string): Promise<void>
  // ... all remaining methods from gowa

  // Handler registration
  onMessage(callback: (wa: WhatsApp, msg: Message) => Promise<void> | void, ...filters: Filter<Message>[]): void
  onCallbackButton(callback: (wa: WhatsApp, cb: CallbackButton) => Promise<void> | void, ...filters: Filter<CallbackButton>[]): void
  onCallbackSelection(callback: (wa: WhatsApp, sel: CallbackSelection) => Promise<void> | void, ...filters: Filter<CallbackSelection>[]): void
  onMessageStatus(callback: (wa: WhatsApp, status: MessageStatus) => Promise<void> | void, ...filters: Filter<MessageStatus>[]): void
  onChatOpened(callback: (wa: WhatsApp, ev: ChatOpened) => Promise<void> | void): void
  onFlowCompletion(callback: (wa: WhatsApp, ev: FlowCompletion) => Promise<void> | void): void
  onPhoneNumberChange(callback: (wa: WhatsApp, ev: PhoneNumberChange) => Promise<void> | void): void
  onIdentityChange(callback: (wa: WhatsApp, ev: IdentityChange) => Promise<void> | void): void
  onTemplateStatusUpdate(callback: (wa: WhatsApp, ev: TemplateStatusUpdate) => Promise<void> | void): void
  onTemplateCategoryUpdate(callback: (wa: WhatsApp, ev: TemplateCategoryUpdate) => Promise<void> | void): void
  onTemplateQualityUpdate(callback: (wa: WhatsApp, ev: TemplateQualityUpdate) => Promise<void> | void): void
  onUserMarketingPreferences(callback: (wa: WhatsApp, ev: UserMarketingPreferences) => Promise<void> | void): void
  onCallConnect(callback: (wa: WhatsApp, ev: CallConnect) => Promise<void> | void): void
  onCallTerminate(callback: (wa: WhatsApp, ev: CallTerminate) => Promise<void> | void): void
  onCallStatus(callback: (wa: WhatsApp, ev: CallStatus) => Promise<void> | void): void
  onCallPermissionUpdate(callback: (wa: WhatsApp, ev: CallPermissionUpdate) => Promise<void> | void): void
  onRawUpdate(callback: (wa: WhatsApp, raw: RawUpdate) => Promise<void> | void): void

  // Listener (blocking conversational flows)
  async listen(opts: ListenOptions): Promise<Message>
  stopListening(senderWaId: string, recipientId?: string, reason?: string): void

  // Handler modules
  addHandlers(...specs: HandlerSpec[]): void
  removeHandlers(silent: boolean, ...specs: HandlerSpec[]): void
  loadHandlerModules(...modules: HandlerModule[]): void

  // Flow endpoint
  registerFlowEndpoint(path: string, handler: FlowRequestHandler): void
}
```

---

## 11. src/adapters/

Each adapter extracts the HTTP body as `Buffer`, the signature header as `string`,
and passes both to `wa.processor.process(body, signature)`. For GET requests,
it reads the `hub.mode`, `hub.verify_token`, `hub.challenge` query params and
calls `wa.processor.handleChallenge(mode, token, challenge)`.

### 11.1 node.ts — raw node:http

```ts
// src/adapters/node.ts
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import type { WhatsApp } from '../client.js'

export function createNodeServer(wa: WhatsApp, port = 3000): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost`)

    if (req.method === 'GET' && url.pathname === wa.webhookEndpoint) {
      const challenge = wa.processor.handleChallenge(
        url.searchParams.get('hub.mode') ?? '',
        url.searchParams.get('hub.verify_token') ?? '',
        url.searchParams.get('hub.challenge') ?? '',
      )
      if (challenge) {
        res.writeHead(200).end(challenge)
      } else {
        res.writeHead(403).end('Forbidden')
      }
      return
    }

    if (req.method === 'POST' && url.pathname === wa.webhookEndpoint) {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = Buffer.concat(chunks)
      const sig = req.headers['x-hub-signature-256'] as string | undefined
      const { status, body: resBody } = await wa.processor.process(body, sig)
      res.writeHead(status).end(resBody)
      return
    }

    res.writeHead(404).end('Not Found')
  })

  server.listen(port)
  return server
}
```

### 11.2 express.ts

```ts
// src/adapters/express.ts
import type { RequestHandler } from 'express'
import type { WhatsApp } from '../client.js'

export function expressWebhook(wa: WhatsApp): RequestHandler {
  return async (req, res) => {
    if (req.method === 'GET') {
      const challenge = wa.processor.handleChallenge(
        req.query['hub.mode'] as string,
        req.query['hub.verify_token'] as string,
        req.query['hub.challenge'] as string,
      )
      return challenge ? res.send(challenge) : res.sendStatus(403)
    }

    // Express with express.raw() or express.json() will have req.body
    // We need the raw buffer — instruct users to use express.raw({ type: '*/*' })
    const body: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body))

    const sig = req.headers['x-hub-signature-256'] as string | undefined
    const { status, body: resBody } = await wa.processor.process(body, sig)
    res.status(status).send(resBody)
  }
}

// Usage:
// app.use('/webhook', express.raw({ type: '*/*' }), expressWebhook(wa))
```

### 11.3 fastify.ts

```ts
// src/adapters/fastify.ts
import type { FastifyPluginAsync } from 'fastify'
import type { WhatsApp } from '../client.js'

export function fastifyWebhook(wa: WhatsApp): FastifyPluginAsync {
  return async (fastify) => {
    fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body)
    })

    fastify.get(wa.webhookEndpoint, (req, reply) => {
      const query = req.query as Record<string, string>
      const challenge = wa.processor.handleChallenge(
        query['hub.mode'],
        query['hub.verify_token'],
        query['hub.challenge'],
      )
      if (challenge) return reply.send(challenge)
      return reply.code(403).send('Forbidden')
    })

    fastify.post(wa.webhookEndpoint, async (req, reply) => {
      const sig = (req.headers['x-hub-signature-256'] as string | undefined)
      const { status, body } = await wa.processor.process(req.body as Buffer, sig)
      return reply.code(status).send(body)
    })
  }
}

// Usage:
// await fastify.register(fastifyWebhook(wa))
```

### 11.4 hono.ts

```ts
// src/adapters/hono.ts
import type { MiddlewareHandler } from 'hono'
import type { WhatsApp } from '../client.js'

export function honoWebhook(wa: WhatsApp): MiddlewareHandler {
  return async (c) => {
    if (c.req.method === 'GET') {
      const mode = c.req.query('hub.mode') ?? ''
      const token = c.req.query('hub.verify_token') ?? ''
      const challenge = c.req.query('hub.challenge') ?? ''
      const result = wa.processor.handleChallenge(mode, token, challenge)
      return result ? c.text(result) : c.text('Forbidden', 403)
    }

    const body = Buffer.from(await c.req.arrayBuffer())
    const sig = c.req.header('x-hub-signature-256')
    const { status, body: resBody } = await wa.processor.process(body, sig)
    return c.text(resBody, status as 200 | 400 | 401)
  }
}

// Usage:
// app.all('/webhook', honoWebhook(wa))
```

### 11.5 nextjs.ts — App Router

```ts
// src/adapters/nextjs.ts
// For Next.js App Router (app/api/webhook/route.ts)
import type { WhatsApp } from '../client.js'
import type { NextRequest } from 'next/server'

export function createNextRouteHandler(wa: WhatsApp) {
  return {
    async GET(req: NextRequest) {
      const { searchParams } = req.nextUrl
      const challenge = wa.processor.handleChallenge(
        searchParams.get('hub.mode') ?? '',
        searchParams.get('hub.verify_token') ?? '',
        searchParams.get('hub.challenge') ?? '',
      )
      if (challenge) {
        return new Response(challenge, { status: 200 })
      }
      return new Response('Forbidden', { status: 403 })
    },

    async POST(req: NextRequest) {
      const body = Buffer.from(await req.arrayBuffer())
      const sig = req.headers.get('x-hub-signature-256') ?? undefined
      const { status, body: resBody } = await wa.processor.process(body, sig)
      return new Response(resBody, { status })
    },
  }
}

// Usage in app/api/webhook/route.ts:
// import { createNextRouteHandler } from 'jswa/adapters/nextjs'
// const { GET, POST } = createNextRouteHandler(wa)
// export { GET, POST }
```

### 11.6 tanstack.ts — TanStack Start

```ts
// src/adapters/tanstack.ts
// TanStack Start uses server functions / API routes
import type { WhatsApp } from '../client.js'

export function createTanStackHandler(wa: WhatsApp) {
  // TanStack Start API route handler (similar to Next.js Route Handlers)
  return {
    async GET(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const challenge = wa.processor.handleChallenge(
        url.searchParams.get('hub.mode') ?? '',
        url.searchParams.get('hub.verify_token') ?? '',
        url.searchParams.get('hub.challenge') ?? '',
      )
      return challenge
        ? new Response(challenge)
        : new Response('Forbidden', { status: 403 })
    },

    async POST(request: Request): Promise<Response> {
      const body = Buffer.from(await request.arrayBuffer())
      const sig = request.headers.get('x-hub-signature-256') ?? undefined
      const { status, body: resBody } = await wa.processor.process(body, sig)
      return new Response(resBody, { status })
    },
  }
}

// Usage in app/api/webhook/route.ts (TanStack Start):
// import { createTanStackHandler } from 'jswa/adapters/tanstack'
// const handler = createTanStackHandler(wa)
// export const Route = createAPIFileRoute('/api/webhook')({ ...handler })
```

---

## 12. src/index.ts — barrel exports

```ts
// Public API surface
export { WhatsApp } from './client.js'
export type { Config } from './client.js'

// Error types
export { WhatsAppError, getErrorKind } from './errors.js'
export type { ErrorKind } from './errors.js'

// Update types
export { BaseUpdate, Message } from './update.js'

// All value types
export type {
  User, Metadata, Location, Reaction, ReplyToMessage, Referral,
  Contact, ContactName, ContactPhone, ContactEmail, ContactURL, ContactAddress, ContactOrg,
  Image, Video, Audio, Document, Sticker, MediaURL,
  Button, URLButton, VoiceCallButton, SectionList, Section, SectionRow,
  FlowButton, ProductsSection,
  CallbackButton, CallbackSelection,
  MessageStatus, MessageStatusType,
  BusinessProfile, BusinessPhoneNumber, CommerceSettings,
  QRCode, FlowStatus, FlowCategory, FlowDetails, CreatedFlow,
  FlowRequest, FlowResponse, FlowCompletion,
  TemplateStatus, TemplateCategory, CreatedTemplate, TemplateDetails,
  SentMessage, SentMediaMessage, SentReaction, SentTemplate,
  ChatOpened, PhoneNumberChange, IdentityChange,
  TemplateStatusUpdate, TemplateCategoryUpdate, TemplateQualityUpdate,
  UserMarketingPreferences,
  CallConnect, CallTerminate, CallStatus, CallPermissionUpdate,
  SessionDescription, InitiatedCall,
  Pagination, Result, RawUpdate,
  WhatsAppBusinessAccount, UsersBlockedResult, UsersUnblockedResult,
  GroupDetails, GroupParticipant, GroupJoinRequest, GroupInviteLink,
  GroupOperation, GroupJoinApprovalMode, UsernameStatus,
  ImageCarouselCard, VideoCarouselCard, CarouselCard,
  ArchiveTemplatesResult, UnarchiveTemplatesResult,
  CreatedBusinessPhoneNumber,
} from './types.js'

// Filters
export {
  and, or, not,
  filterText, filterImage, filterVideo, filterAudio, filterVoice,
  filterDocument, filterSticker, filterLocation, filterContacts,
  filterReaction, filterReply, filterForwarded, filterMedia,
  filterFromWaId, filterTextContains, filterTextPrefix,
  filterCallbackData, filterCallbackPrefix,
  filterStatusSent, filterStatusDelivered, filterStatusRead, filterStatusFailed,
} from './filters.js'
export type { Filter } from './filters.js'

// Handler module interface
export type { HandlerSpec, HandlerModule } from './handlers.js'
export {
  messageHandlerSpec, callbackButtonHandlerSpec,
  callbackSelectionHandlerSpec, messageStatusHandlerSpec,
} from './handlers.js'

// Listener errors
export { ListenerTimeout, ListenerCanceled, ListenerStopped } from './listeners.js'
export type { ListenOptions } from './listeners.js'
```

---

## 13. All 116 client methods to implement

Translate every method from gowa 1:1. Method names are camelCase.
The complete list (from `gowa/*.go`):

```
acceptCall             addHandlers            addMessageHandler
approveGroupJoinRequests archiveTemplates     blockUsers
compareTemplates       createFlow             createGroup
createPhoneNumber      createQRCode           createTemplate
deleteFlow             deleteGroup            deleteMedia
deletePhoneCallbackUrl deleteQRCode           deleteTemplate
deleteUsername         deleteWABACallbackUrl  deprecateFlow
deregisterPhoneNumber  downloadMedia          getAppAccessToken
getBlockedUsers        getBusinessAccessToken getBusinessAccount
getBusinessPhoneNumber getBusinessPhoneNumberSettings
getBusinessPhoneNumbers getBusinessProfile    getCallPermissions
getCommerceSettings    getCurrentUsername     getFlow
getFlowAssets          getFlowMetrics         getFlows
getGroup               getGroupInviteLink     getGroupJoinRequests
getGroups              getMediaBytes          getMediaUrl
getOwnedBusinessAccounts getQRCode            getQRCodes
getReservedUsernames   getSharedBusinessAccounts getTemplate
getTemplates           getWABASubscribedApps  handleWebhookUpdate
indicateTyping         initiateCall           listen
loadHandlerModules     markMessageAsRead      migrateFlows
migrateTemplates       onCallbackButton       onCallbackSelection
onCallConnect          onCallPermissionUpdate onCallStatus
onCallTerminate        onChatOpened           onFlowCompletion
onIdentityChange       onMessage              onMessageStatus
onPhoneNumberChange    onRawUpdate            onTemplateCategoryUpdate
onTemplateQualityUpdate onTemplateStatusUpdate onUserMarketingPreferences
overridePhoneCallbackUrl overrideWABACallbackUrl pinMessage
preAcceptCall          publishFlow            registerFlowEndpoint
registerPhoneNumber    rejectCall             rejectGroupJoinRequests
removeCallbackButtonHandler removeCallbacks  removeGroupParticipants
removeHandlers         removeMessageHandler   removeReaction
requestContactInfo     requestLocation        requestVerificationCode
resetGroupInviteLink   sendAudio              sendCarousel
sendCatalog            sendContact            sendDocument
sendImage              sendLocation           sendMessage
sendProduct            sendProducts           sendRawRequest
sendReaction           sendSticker            sendTemplate
sendText               sendVideo              sendVoice
setAppCallbackUrl      setBusinessPublicKey   setToken
setUsername            stopListening          streamMedia
terminateCall          unarchiveTemplates     unblockUsers
unpauseTemplate        unpinMessage           updateBusinessAccountSettings
updateBusinessPhoneNumberSettings updateBusinessProfile
updateCommerceSettings updateConversationalAutomation
updateDisplayName      updateFlowJSON         updateFlowMetadata
updateGroupSettings    updateQRCode           updateTemplate
uploadMedia            upsertAuthenticationTemplate
verifyPhoneNumber      webhookEndpoint
```

---

## 14. Critical implementation notes

### Media upload MIME type (THE most important bug to not repeat)

The Go implementation had a bug where `multipart.CreateFormFile` hardcoded
`Content-Type: application/octet-stream` on the file part, causing WhatsApp
to reject all non-binary uploads with error code 100.

**In TypeScript with native `fetch` and `FormData`, use a `Blob` with the
MIME type set — this automatically sets the correct `Content-Type` on the
part header:**

```ts
const blob = new Blob([fileData], { type: mimeType })
formData.append('file', blob, filename)
// The Blob's type becomes the part's Content-Type — correct behaviour
```

**Do NOT do:**
```ts
formData.append('file', fileData)  // no type → application/octet-stream → rejected
```

### Media resolution

`resolveMedia()` in gowa accepts a URL string, file path string, or `Buffer`.
Replicate this in TypeScript:

```ts
type MediaInput = string | Buffer | Uint8Array   // URL string, file path, or raw bytes

async function resolveMedia(
  media: MediaInput,
  mimeType: string | undefined,
  sender: string,
  mediaType: string,
): Promise<{ mediaParam: Record<string, string>; mediaId?: string }>
```

- If string starts with `http://` or `https://` → `{ link: url }`
- If string is a file path → read file, detect MIME from extension, upload
- If Buffer → upload directly (mimeType required)

### Webhook body must be raw bytes

Every framework adapter must ensure the body reaches `processor.process()` as
a `Buffer` of **raw bytes**, not a parsed JSON object. HMAC validation is done
over the raw bytes. Parsing must happen **after** validation.

### Async handler dispatch — don't block the webhook response

Handlers are `async`. The webhook endpoint must return `200 OK` immediately
and run handlers in the background:

```ts
// In process():
const webhookResult = { status: 200, body: '' }

// Fire and forget — don't await
this.dispatchUpdate(raw).catch(err => console.error('[jswa] handler error:', err))

return webhookResult
```

### Listen() implementation

Use a `Map<string, ListenerEntry>` keyed by `${senderWaId}:${recipientId}`.
Each entry wraps a `Promise` with its `resolve` / `reject` functions.
`dispatchMessage()` checks this map before dispatching to normal handlers —
if a listener claims the message, normal handlers don't fire.

```ts
interface ListenerEntry {
  resolve: (msg: Message) => void
  reject: (err: Error) => void
  filter?: Filter<Message>
  canceler?: Filter<Message>
  timer?: NodeJS.Timeout
}
```

### Handler priority

Priority is a number. Higher = runs first. Sort descending on insert.
`continueHandling: false` (default) stops after the first matching handler.

---

## 15. Usage examples to write in README

### Basic

```ts
import { WhatsApp } from 'jswa'

const wa = new WhatsApp({
  token: 'ACCESS_TOKEN',
  phoneId: 'PHONE_NUMBER_ID',
  appSecret: 'APP_SECRET',
  verifyToken: 'MY_VERIFY_TOKEN',
})

const msg = await wa.sendMessage('2348012345678', 'Hello from jswa! 👋')
console.log(msg.id)
```

### Webhook with handlers (Express)

```ts
import express from 'express'
import { WhatsApp, filterText } from 'jswa'
import { expressWebhook } from 'jswa/adapters/express'

const wa = new WhatsApp({ token, phoneId, appSecret, verifyToken })

wa.onMessage(async (wa, msg) => {
  await msg.indicateTyping()
  await msg.reply(`You said: ${msg.text}`)
}, filterText)

const app = express()
app.use('/webhook', express.raw({ type: '*/*' }), expressWebhook(wa))
app.listen(3000)
```

### Conversational flow with listen()

```ts
wa.onMessage(async (wa, msg) => {
  await msg.reply("What's your name?")

  try {
    const reply = await msg.waitForReply(filterText, 30_000)
    await msg.reply(`Nice to meet you, ${reply.text}!`)
  } catch (err) {
    if (err instanceof ListenerTimeout) {
      await msg.reply('You took too long! Try again.')
    }
  }
}, filterTextPrefix('/start'))
```

### Carousel

```ts
await wa.sendCarousel('2348012345678', 'Choose your plan 👇', [
  {
    type: 'image',
    image: 'https://example.com/starter.jpg',
    body: 'Starter – ₦5,000/mo',
    buttons: [{ id: 'plan_starter', title: 'Choose Starter' }],
  },
  {
    type: 'image',
    image: 'https://example.com/pro.jpg',
    body: 'Pro – ₦15,000/mo',
    buttons: [{ id: 'plan_pro', title: 'Choose Pro' }],
  },
])
```

### Next.js App Router

```ts
// app/api/webhook/route.ts
import { createNextRouteHandler } from 'jswa/adapters/nextjs'
import { wa } from '@/lib/whatsapp'   // your singleton WhatsApp instance

export const { GET, POST } = createNextRouteHandler(wa)
```

---

## 16. What NOT to port

| pywa feature | Reason to skip |
|---|---|
| Async client variants | TypeScript is always async — `async/await` is native |
| Flask/FastAPI/Django server coupling | Replaced by the adapter pattern in section 11 |
| Python dataclass auto-generation | TypeScript interfaces serve this role |
| `__repr__` / `__str__` | Implement `toString()` where useful |
| Type hints as runtime validators | Use Zod or `unknown` + type narrowing in webhook parser |

---

## 17. Test plan (write at least these)

1. `validateSignature` — known payload and HMAC secret, check pass and fail
2. `uploadMedia` — mock fetch, verify FormData has `Blob` with correct `type`
3. `handleChallenge` — valid and invalid verify tokens
4. `process()` — invalid signature returns 401, valid returns 200
5. `listen()` — resolves when matching message arrives, rejects on timeout
6. `dispatchMessage` — routes button tap to `onCallbackButton`, not `onMessage`
7. `and()` / `or()` / `not()` filter combinators
8. Handler priority ordering

---

## 18. Session startup checklist

When the new session begins, do this in order:

1. `git clone https://github.com/tobibamidele/gowa.git` — primary reference
2. `git clone https://github.com/tobibamidele/jswa.git` — output repo
3. Read every file in `gowa/` before writing anything
4. Create `package.json`, `tsconfig.json`, `tsup.config.ts` first
5. Write `src/errors.ts` → `src/types.ts` → `src/update.ts` → `src/filters.ts`
   → `src/handlers.ts` → `src/listeners.ts` → `src/api.ts` → `src/webhook.ts`
   → `src/client.ts` → `src/adapters/*.ts` → `src/index.ts`
6. After each file: `npx tsc --noEmit` to typecheck before moving on
7. Commit after each file with a descriptive message
8. Write the README last, after all source is done

---

## 19. Caveats and known sharp edges

- **`node:crypto.timingSafeEqual`** requires both buffers to be the same length.
  Pad or hash both sides before comparing to avoid timing leaks on length mismatch.

- **`fetch` FormData in Node 18** — Node's built-in `fetch` uses `undici` under
  the hood. `FormData` + `Blob` work correctly. If a user is on Node 16, they
  need a polyfill. Document this.

- **WABA/phone ID resolution** — every send method accepts an optional `sender`
  (phone number ID). When absent, fall back to `config.phoneId`. When that is
  also absent, throw a clear error. Mirror `resolveSender()` from gowa/client.go.

- **Media from file path** — use `fs.promises.readFile` to read. Detect MIME
  type from the file extension using a small lookup table (same as gowa's
  `mimeTypeFromPath`). Do **not** pull in the `mime` npm package — keep it
  dependency-free.

- **Streaming media** — `streamMedia` should `fetch()` with Authorization
  header and return `response.body` as a Node.js `Readable`. Use
  `Readable.fromWeb(response.body)` (available from Node 18).

- **Flow decryption** — pywa decrypts Flow request payloads with the business
  private key. This is an RSA-OAEP + AES-GCM operation. Use `node:crypto`
  `crypto.privateDecrypt` with `RSA_PKCS1_OAEP_PADDING`. Mirror pywa's
  `_decrypt_request` function. Only implement this if time allows — mark
  with `// TODO: Flow decryption` if skipping.

- **Duplicate update deduplication** — gowa tracks seen message IDs to avoid
  double-dispatching. Implement with a `Map<string, number>` (id → timestamp),
  pruning entries older than 5 minutes.
