/**
 * webhook.ts — port of gowa/webhook.go
 *
 * Signature validation, JSON parsing, and update routing. Unlike gowa (which
 * exposes an `http.Handler`) or pywa (tightly coupled to Flask/FastAPI),
 * jswa exposes a framework-agnostic `WebhookProcessor` — every adapter in
 * `src/adapters/*` is a thin wrapper around `process()` and `handleChallenge()`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WhatsApp } from './client.js'
import { whatsAppErrorFromMap } from './errors.js'
import {
  CallPermissionUpdate,
  CallbackButton,
  CallbackSelection,
  FlowCompletion,
  Message,
} from './update.js'
import type {
  Contact,
  IdentityChange,
  Metadata,
  MessageStatus,
  MessageType,
  OrderItem,
  PhoneNumberChange,
  RawUpdate,
  ChatOpened,
  TemplateCategoryUpdate,
  TemplateQualityUpdate,
  TemplateStatusUpdate,
  UserMarketingPreferences,
} from './types.js'
import { User } from './types.js'

const SIGNATURE_HEADER = 'x-hub-signature-256'

/** Verifies the `X-Hub-Signature-256` header on an incoming webhook payload. */
export function validateSignature(appSecret: string, body: Buffer, sigHeader: string): boolean {
  const prefix = 'sha256='
  if (!sigHeader.startsWith(prefix)) return false
  const sig = sigHeader.slice(prefix.length)
  const expected = createHmac('sha256', appSecret).update(body).digest('hex')
  // Pad to equal length first: Node's timingSafeEqual throws (rather than
  // returning false) when buffer lengths differ, which would otherwise leak
  // timing information about the length of a forged signature.
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(sigBuf, expectedBuf)
}

function toStr(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}
function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0)
}
function toBool(v: unknown): boolean {
  return v === true || v === 'true'
}
function toMap(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function toArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function toDate(v: unknown): Date {
  const n = toNum(v)
  return n > 0 ? new Date(n * 1000) : new Date(0)
}

function parseMetadata(value: Record<string, unknown>): Metadata {
  const meta = toMap(value.metadata)
  return { displayPhoneNumber: toStr(meta.display_phone_number), phoneNumberId: toStr(meta.phone_number_id) }
}

function parseUser(value: Record<string, unknown>, msg: Record<string, unknown>): User {
  let name = ''
  const contacts = toArr(value.contacts)
  if (contacts.length > 0) {
    const profile = toMap(toMap(contacts[0]).profile)
    name = toStr(profile.name)
  }
  return new User({ waId: toStr(msg.from), name })
}

function parseMediaBase(m: Record<string, unknown>, client: WhatsApp) {
  return { id: toStr(m.id), sha256: toStr(m.sha256), mimeType: toStr(m.mime_type), _client: client }
}

function parseContact(cm: Record<string, unknown>): Contact {
  const n = toMap(cm.name)
  const contact: Contact = {
    name: {
      formattedName: toStr(n.formatted_name),
      firstName: toStr(n.first_name),
      lastName: toStr(n.last_name),
      middleName: toStr(n.middle_name),
      suffix: toStr(n.suffix),
      prefix: toStr(n.prefix),
    },
  }
  const phones = toArr(cm.phones).map(toMap)
  if (phones.length) contact.phones = phones.map((p) => ({ phone: toStr(p.phone), waId: toStr(p.wa_id), type: toStr(p.type) }))
  const emails = toArr(cm.emails).map(toMap)
  if (emails.length) contact.emails = emails.map((e) => ({ email: toStr(e.email), type: toStr(e.type) }))
  const urls = toArr(cm.urls).map(toMap)
  if (urls.length) contact.urls = urls.map((u) => ({ url: toStr(u.url), type: toStr(u.type) }))
  return contact
}

function parseOrderItems(arr: unknown[]): OrderItem[] {
  return arr.map(toMap).map((m) => ({
    productRetailerId: toStr(m.product_retailer_id),
    quantity: toNum(m.quantity),
    itemPrice: toNum(m.item_price),
    currency: toStr(m.currency),
  }))
}

interface BaseFields {
  id: string
  metadata: Metadata
  from: User
  timestamp: Date
}

function parseMessage(base: BaseFields, msgType: MessageType, msg: Record<string, unknown>, client: WhatsApp): Message {
  const data: { type: MessageType } & Partial<Message> = { type: msgType }

  const ctx = toMap(msg.context)
  if (Object.keys(ctx).length) {
    data.forwarded = toBool(ctx.forwarded)
    data.forwardedManyTimes = toBool(ctx.frequently_forwarded)
    const replyId = toStr(ctx.id)
    if (replyId) data.replyToMessage = { messageId: replyId, fromWaId: toStr(ctx.from) }
  }

  const ref = toMap(msg.referral)
  if (Object.keys(ref).length) {
    data.referral = {
      sourceUrl: toStr(ref.source_url),
      sourceId: toStr(ref.source_id),
      sourceType: toStr(ref.source_type),
      headline: toStr(ref.headline),
      body: toStr(ref.body),
      mediaType: toStr(ref.media_type),
      imageUrl: toStr(ref.image_url),
      videoUrl: toStr(ref.video_url),
      ctwaClid: toStr(ref.ctwa_clid),
    }
  }

  const errs = toArr(msg.errors)
  if (errs.length) data.error = whatsAppErrorFromMap(toMap(errs[0]))

  switch (msgType) {
    case 'text':
      data.text = toStr(toMap(msg.text).body)
      break
    case 'image':
      data.image = { ...parseMediaBase(toMap(msg.image), client), caption: toStr(toMap(msg.image).caption) }
      break
    case 'video':
      data.video = { ...parseMediaBase(toMap(msg.video), client), caption: toStr(toMap(msg.video).caption) }
      break
    case 'audio':
      data.audio = { ...parseMediaBase(toMap(msg.audio), client), voice: toBool(toMap(msg.audio).voice) }
      break
    case 'document':
      data.document = {
        ...parseMediaBase(toMap(msg.document), client),
        caption: toStr(toMap(msg.document).caption),
        filename: toStr(toMap(msg.document).filename),
      }
      break
    case 'sticker':
      data.sticker = { ...parseMediaBase(toMap(msg.sticker), client), animated: toBool(toMap(msg.sticker).animated) }
      break
    case 'reaction':
      data.reaction = { messageId: toStr(toMap(msg.reaction).message_id), emoji: toStr(toMap(msg.reaction).emoji) }
      break
    case 'location': {
      const loc = toMap(msg.location)
      data.location = {
        latitude: toNum(loc.latitude),
        longitude: toNum(loc.longitude),
        name: toStr(loc.name),
        address: toStr(loc.address),
        url: toStr(loc.url),
      }
      break
    }
    case 'contacts':
      data.contacts = toArr(msg.contacts).map(toMap).map(parseContact)
      break
    case 'order': {
      const ord = toMap(msg.order)
      data.order = {
        catalogId: toStr(ord.catalog_id),
        text: toStr(ord.text),
        productItems: parseOrderItems(toArr(ord.product_items)),
      }
      break
    }
    default:
      data.unsupported = { messageType: toStr(msg.type) || msgType }
      data.type = 'unsupported'
  }

  return new Message(base, data)
}

/** Configuration the processor needs from its owning `WhatsApp` client. */
export interface WebhookProcessorDeps {
  appSecret?: string
  verifyToken?: string
  phoneId?: string
  dedupe: (messageId: string) => boolean // returns true if this ID was already seen
  notifyListeners: (msg: Message) => boolean
  dispatchRaw: (raw: RawUpdate) => void | Promise<void>
  dispatchMessage: (msg: Message) => void | Promise<void>
  dispatchCallbackButton: (cb: CallbackButton) => void | Promise<void>
  dispatchCallbackSelection: (cs: CallbackSelection) => void | Promise<void>
  dispatchFlowCompletion: (fc: FlowCompletion) => void | Promise<void>
  dispatchCallPermission: (cpu: CallPermissionUpdate) => void | Promise<void>
  dispatchChatOpened: (co: ChatOpened) => void | Promise<void>
  dispatchPhoneNumberChange: (pnc: PhoneNumberChange) => void | Promise<void>
  dispatchIdentityChange: (ic: IdentityChange) => void | Promise<void>
  dispatchMessageStatus: (ms: MessageStatus) => void | Promise<void>
  dispatchTemplateStatusUpdate: (u: TemplateStatusUpdate) => void | Promise<void>
  dispatchTemplateQualityUpdate: (u: TemplateQualityUpdate) => void | Promise<void>
  dispatchTemplateCategoryUpdate: (u: TemplateCategoryUpdate) => void | Promise<void>
  dispatchUserMarketingPreferences: (u: UserMarketingPreferences) => void | Promise<void>
}

/** Result of `WebhookProcessor.process()` — what the adapter should send back. */
export interface ProcessResult {
  status: number
  body: string
}

/**
 * Framework-agnostic webhook handler. Every adapter (`adapters/express.ts`,
 * `adapters/hono.ts`, …) reduces its framework's request object down to
 * `{ body: Buffer, signature?, query? }` and calls into this class.
 */
export class WebhookProcessor {
  constructor(
    private readonly wa: WhatsApp,
    private readonly deps: WebhookProcessorDeps,
  ) {}

  /** Handles the Meta verification GET request. Returns the challenge string, or `null` if invalid. */
  handleChallenge(mode: string, token: string, challenge: string): string | null {
    if (mode !== 'subscribe') return null
    if (token !== this.deps.verifyToken) return null
    return challenge
  }

  /**
   * Main entry point for POST requests. Validates the signature (if
   * `appSecret` is configured), then dispatches asynchronously — the
   * response is returned immediately per JSWA_SPEC.md §14 ("don't block the
   * webhook response"); handler errors are logged, not thrown.
   */
  async process(body: Buffer, signature?: string): Promise<ProcessResult> {
    if (this.deps.appSecret) {
      if (!signature) return { status: 401, body: 'missing signature' }
      if (!validateSignature(this.deps.appSecret, body, signature)) {
        return { status: 401, body: 'invalid signature' }
      }
    }

    let raw: RawUpdate
    try {
      raw = JSON.parse(body.toString('utf-8')) as RawUpdate
    } catch {
      return { status: 400, body: 'invalid JSON' }
    }

    // Fire and forget — the caller (adapter) should not await dispatch.
    this.dispatchUpdate(raw).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[jswa] handler error:', err)
    })

    return { status: 200, body: '' }
  }

  private async dispatchUpdate(raw: RawUpdate): Promise<void> {
    await this.deps.dispatchRaw(raw)

    const entries = toArr(raw.entry).map(toMap)
    for (const entry of entries) {
      const changes = toArr(entry.changes).map(toMap)
      for (const change of changes) {
        const field = toStr(change.field)
        const value = toMap(change.value)
        if (!Object.keys(value).length) continue

        if (this.deps.phoneId) {
          const meta = toMap(value.metadata)
          if (Object.keys(meta).length && toStr(meta.phone_number_id) !== this.deps.phoneId) continue
        }

        switch (field) {
          case 'messages':
            await this.dispatchMessagesField(value)
            break
          case 'message_template_status_update':
            await this.deps.dispatchTemplateStatusUpdate({
              templateId: toStr(value.message_template_id),
              templateName: toStr(value.message_template_name),
              status: toStr(value.event) as never,
              reason: toStr(value.reason),
            })
            break
          case 'message_template_quality_update':
            await this.deps.dispatchTemplateQualityUpdate({
              templateId: toStr(value.message_template_id),
              templateName: toStr(value.message_template_name),
              qualityScore: toStr(value.quality_score),
            })
            break
          case 'message_template_category_update':
            await this.deps.dispatchTemplateCategoryUpdate({
              templateId: toStr(value.message_template_id),
              templateName: toStr(value.message_template_name),
              previousCategory: toStr(value.previous_category) as never,
              newCategory: toStr(value.new_category) as never,
            })
            break
          case 'marketing_messages':
            await this.dispatchMarketingPreferences(value)
            break
        }
      }
    }
  }

  private async dispatchMessagesField(value: Record<string, unknown>): Promise<void> {
    const metadata = parseMetadata(value)

    for (const m of toArr(value.messages).map(toMap)) {
      await this.dispatchMessage(metadata, m, value)
    }
    for (const s of toArr(value.statuses).map(toMap)) {
      await this.dispatchStatus(metadata, s)
    }
  }

  private async dispatchMessage(
    meta: Metadata,
    msg: Record<string, unknown>,
    value: Record<string, unknown>,
  ): Promise<void> {
    const msgType = toStr(msg.type) as MessageType
    const from = parseUser(value, msg)
    from._client = this.wa
    const ts = toDate(msg.timestamp)
    const id = toStr(msg.id)

    // Deduplicate: WhatsApp occasionally redelivers the same update.
    if (id && this.deps.dedupe(id)) return

    const base: BaseFields = { id, metadata: meta, from, timestamp: ts }

    switch (msgType) {
      case 'button': {
        const btn = toMap(msg.button)
        const cb = new CallbackButton(base, toStr(btn.text), toStr(btn.payload))
        cb._client = this.wa
        await this.deps.dispatchCallbackButton(cb)
        return
      }
      case 'interactive': {
        const interactive = toMap(msg.interactive)
        const iType = toStr(interactive.type)
        if (iType === 'button_reply') {
          const br = toMap(interactive.button_reply)
          const cb = new CallbackButton(base, toStr(br.title), toStr(br.id))
          cb._client = this.wa
          await this.deps.dispatchCallbackButton(cb)
        } else if (iType === 'list_reply') {
          const lr = toMap(interactive.list_reply)
          const cs = new CallbackSelection(base, toStr(lr.title), toStr(lr.id), toStr(lr.description))
          cs._client = this.wa
          await this.deps.dispatchCallbackSelection(cs)
        } else if (iType === 'nfm_reply') {
          const nfm = toMap(interactive.nfm_reply)
          const respBody = toMap(nfm.response_json)
          const fc = new FlowCompletion(base, toStr(respBody.flow_token), respBody)
          fc._client = this.wa
          await this.deps.dispatchFlowCompletion(fc)
        } else if (iType === 'call_permission_reply') {
          const cpu = new CallPermissionUpdate(base, toStr(interactive.call_permission_reply))
          cpu._client = this.wa
          await this.deps.dispatchCallPermission(cpu)
        }
        return
      }
      case 'request_welcome':
        await this.deps.dispatchChatOpened({ metadata: meta, timestamp: ts, from })
        return
      case 'system': {
        const sys = toMap(msg.system)
        const sysType = toStr(sys.type)
        if (sysType === 'user_changed_number' || sysType === 'customer_changed_number') {
          await this.deps.dispatchPhoneNumberChange({
            metadata: meta,
            timestamp: ts,
            oldWaId: toStr(sys.customer),
            newWaId: toStr(sys.new_wa_id),
          })
        } else if (sysType === 'customer_identity_changed') {
          await this.deps.dispatchIdentityChange({
            metadata: meta,
            timestamp: ts,
            from,
            createdTimestamp: toDate(sys.identity_key_creation_timestamp),
            hash: toStr(sys.acknowledged_country),
          })
        }
        return
      }
      default: {
        const m = parseMessage(base, msgType, msg, this.wa)
        m._client = this.wa
        if (this.deps.notifyListeners(m)) return
        await this.deps.dispatchMessage(m)
      }
    }
  }

  private async dispatchStatus(meta: Metadata, status: Record<string, unknown>): Promise<void> {
    let apiErr
    const errs = toArr(status.errors)
    if (errs.length) apiErr = whatsAppErrorFromMap(toMap(errs[0]))

    const from = new User({ waId: toStr(status.recipient_id) })
    from._client = this.wa

    const ms: MessageStatus = {
      id: toStr(status.id),
      metadata: meta,
      status: toStr(status.status) as never,
      timestamp: toDate(status.timestamp),
      from,
      trackerId: toStr(status.biz_opaque_callback_data),
      ...(apiErr ? { error: apiErr } : {}),
    }
    await this.deps.dispatchMessageStatus(ms)
  }

  private async dispatchMarketingPreferences(value: Record<string, unknown>): Promise<void> {
    const meta = parseMetadata(value)
    for (const c of toArr(value.contacts).map(toMap)) {
      const from = new User({ waId: toStr(c.wa_id) })
      from._client = this.wa
      await this.deps.dispatchUserMarketingPreferences({
        metadata: meta,
        timestamp: toDate(value.timestamp),
        from,
        optIn: toStr(value.marketing_opt_in_opted_in) === 'true',
      })
    }
  }
}
