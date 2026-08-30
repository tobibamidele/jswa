/**
 * client.ts — port of gowa/client.go + client_extended.go + client_remaining.go + client_v2.go
 *
 * `WhatsApp` is the public API surface — the single entry point for sending
 * messages, managing templates/flows/groups, and registering webhook
 * handlers. Go's `(value, error)` returns become thrown `WhatsAppError`s;
 * Go's variadic `opts ...Options` becomes a plain optional object parameter.
 */

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { Readable } from 'node:stream'

import { GraphAPI } from './api.js'
import { NoWebhookError, WhatsAppError } from './errors.js'
import { HandlerList, type HandlerCallback } from './handlers.js'
import { ListenerRegistry, listen as listenImpl, type ListenOptions } from './listeners.js'
import type { Filter } from './filters.js'
import {
  BaseUpdate,
  CallPermissionUpdate,
  CallbackButton,
  CallbackSelection,
  FlowCompletion,
  Message,
} from './update.js'
import { WebhookProcessor, type ProcessResult } from './webhook.js'
import {
  Result,
  User,
  contactToDict,
  sectionListToDict,
  productsSectionToDict,
  sessionDescriptionToDict,
  commandToDict,
  paginationToQuery,
  carouselCardToDict,
  type ArchiveTemplatesResult,
  type Button,
  type CallConnect,
  type CallStatus,
  type CallTerminate,
  type CallingSettings,
  type CarouselCard,
  type ChatOpened,
  type Command,
  type CommerceSettings,
  type Contact,
  type CreatedBusinessPhoneNumber,
  type CreatedFlow,
  type CreatedTemplate,
  type FlowButton,
  type FlowCategory,
  type FlowDetails,
  type FlowMetricGranularity,
  type FlowMetricName,
  type FlowRequest,
  type FlowResponse,
  type GroupDetails,
  type GroupInviteLink,
  type GroupJoinApprovalMode,
  type GroupJoinRequest,
  type GroupOperation,
  type GroupParticipant,
  type IdentityChange,
  type InitiatedCall,
  type MediaURL,
  type Pagination,
  type PhoneNumberChange,
  type QRCode,
  type RawUpdate,
  type SectionList,
  type SentContactInfoRequest,
  type SentLocationRequest,
  type SentMediaMessage,
  type SentMessage,
  type SentReaction,
  type SentTemplate,
  type SessionDescription,
  type StorageConfiguration,
  type TemplateArchiveEntry,
  type TemplateCategoryUpdate,
  type TemplateDetails,
  type TemplateQualityUpdate,
  type TemplateStatus,
  type TemplateStatusUpdate,
  type UnarchiveTemplatesResult,
  type URLButton,
  type UsernameStatus,
  type UsersBlockedResult,
  type UsersUnblockedResult,
  type UserMarketingPreferences,
  type WhatsAppBusinessAccount,
} from './types.js'

const DEFAULT_API_VERSION = '22.0'
const DEDUPE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes, matching gowa's pruning window

// ── Config ───────────────────────────────────────────────────────────────────

/** Settings passed to `new WhatsApp(config)`. */
export interface Config {
  /** Bearer access token (required unless you only receive webhooks). */
  token?: string
  /** Sender phone number ID (required for sending). */
  phoneId: string
  /** WABA ID (required for template/flow/group management). */
  businessAccountId?: string
  /** Meta app ID (required for callback URL registration). */
  appId?: string
  /** Meta app secret (required for webhook signature validation). */
  appSecret?: string
  /** Webhook challenge token (required to receive updates). */
  verifyToken?: string
  /** HTTP path the webhook is served on. Default: `/webhook`. */
  webhookEndpoint?: string
  /** Graph API version. Default: `22.0`. */
  apiVersion?: string
  /** Drop updates not addressed to this phoneId. Default: `true`. */
  filterUpdates?: boolean
  /** Call every matching handler instead of stopping at the first. Default: `false`. */
  continueHandling?: boolean
  /** RSA private key PEM for Flow request decryption (optional). */
  businessPrivateKey?: string
  businessPrivateKeyPassword?: string
  /** Custom fetch implementation (for testing, proxies, etc). */
  fetch?: typeof fetch
}

// ── Option interfaces (one per send/management method family) ──────────────

export interface SendMessageOptions {
  previewUrl?: boolean
  replyToMessageId?: string
  tracker?: string
  identityKeyHash?: string
  sender?: string
  header?: string
  footer?: string
  buttons?: Button[] | URLButton | SectionList | FlowButton
}

export interface SendMediaOptions {
  replyToMessageId?: string
  tracker?: string
  identityKeyHash?: string
  sender?: string
  footer?: string
  buttons?: Button[] | URLButton | SectionList | FlowButton
  mimeType?: string
  filename?: string
}

export interface SendReactionOptions {
  sender?: string
}
export interface RemoveReactionOptions {
  sender?: string
}

export interface SendLocationOptions {
  replyToMessageId?: string
  sender?: string
}

export interface SendContactOptions {
  replyToMessageId?: string
  sender?: string
}

export interface SendTemplateOptions {
  replyToMessageId?: string
  sender?: string
  language?: string
  bodyParams?: unknown[]
  headerParams?: unknown[]
  buttonParams?: Record<number, unknown[]>
  components?: Record<string, unknown>[]
}

export interface SendCatalogOptions {
  replyToMessageId?: string
  sender?: string
  thumbnailProductSku?: string
}

export interface SendProductOptions {
  replyToMessageId?: string
  sender?: string
}

export interface SendProductsOptions {
  replyToMessageId?: string
  sender?: string
}

export interface SendCarouselOptions {
  replyToMessageId?: string
  sender?: string
}

export interface RequestContactInfoOptions {
  replyToMessageId?: string
  sender?: string
}

export interface UpdateBusinessProfileOptions {
  phoneId?: string
  about?: string
  address?: string
  description?: string
  email?: string
  websites?: string[]
  verticalName?: string
  profilePictureHandle?: string
}

export interface CreateTemplateOptions {
  wabaId?: string
}

export interface CreateFlowOptions {
  wabaId?: string
  flowJson?: unknown
  endpointUri?: string
  clone?: boolean
}

export interface InitiateCallOptions {
  sender?: string
  tracker?: string
}

export interface UpdateConversationalAutomationOptions {
  phoneId?: string
  commands?: Command[]
  prompts?: string[]
}

export interface GetTemplatesOptions {
  wabaId?: string
  pagination?: Pagination
}

export interface UpdateTemplateOptions {
  category?: string
  components?: Record<string, unknown>[]
}

export interface UpdateFlowMetadataOptions {
  name?: string
  categories?: FlowCategory[]
  endpointUri?: string
  applicationId?: string
}

export interface UpsertAuthTemplateOptions {
  wabaId?: string
  languages: string[]
  buttonText?: string
  codeExpirationMinutes?: number
  addSecurityRecommendation?: boolean
}

export interface UpdateBusinessPhoneNumberSettingsOptions {
  phoneId?: string
  callingSettings?: CallingSettings
  storageConfiguration?: StorageConfiguration
}

export interface CreateGroupOptions {
  phoneId?: string
  description?: string
  participants?: string[]
  joinApprovalMode?: GroupJoinApprovalMode
  imagePath?: string
}

export interface UpdateGroupSettingsOptions {
  subject?: string
  description?: string
  imagePath?: string
  joinApprovalMode?: GroupJoinApprovalMode
}

export interface PinMessageOptions {
  sender?: string
}

export interface SetUsernameOptions {
  phoneId?: string
}

export interface UpdateBusinessAccountSettingsOptions {
  wabaId?: string
  [key: string]: unknown
}

export type FlowMetricOptions = { start?: string; end?: string }

/** Signature for a WhatsApp Flow data-exchange request handler. */
export type FlowRequestHandlerFunc = (wa: WhatsApp, req: FlowRequest) => Promise<FlowResponse>

// ── Small helpers ────────────────────────────────────────────────────────────

function extractSentMessage(res: Record<string, unknown>, senderPhoneId: string, to: string): SentMessage {
  let id = ''
  const messages = res.messages as unknown[] | undefined
  if (Array.isArray(messages) && messages.length > 0) {
    id = String((messages[0] as Record<string, unknown>)?.id ?? '')
  }
  return { id, fromPhoneId: senderPhoneId, to, timestamp: new Date() }
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.amr': 'audio/amr',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
}

/** Infers a MIME type from a file extension. Kept dependency-free (no `mime` package). */
function mimeTypeFromPath(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function extensionFromMimeType(mimeType: string): string {
  const entry = Object.entries(MIME_BY_EXT).find(([, v]) => v === mimeType)
  return entry ? entry[0] : ''
}

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

function applyButtons(m: Record<string, unknown>, buttons?: Button[] | URLButton | SectionList | FlowButton): void {
  if (!buttons) return
  if (Array.isArray(buttons)) {
    m.type = 'button'
    m.action = {
      buttons: buttons.map((btn) => ({ type: 'reply', reply: { id: btn.id, title: btn.title } })),
    }
  } else if ('sections' in buttons) {
    m.type = 'list'
    m.action = sectionListToDict(buttons)
  } else if ('url' in buttons) {
    m.type = 'cta_url'
    m.action = { name: 'cta_url', parameters: { display_text: buttons.title, url: buttons.url } }
  } else if ('flowId' in buttons) {
    m.type = 'flow'
    m.action = {
      name: 'flow',
      parameters: {
        flow_message_version: '3',
        flow_token: buttons.flowToken,
        flow_id: buttons.flowId,
        flow_cta: buttons.text,
        flow_action: 'navigate',
        flow_action_payload: { screen: buttons.navigateTo, data: buttons.flowData },
      },
    }
  }
}

function buildInteractivePayload(
  body: string,
  header: string | undefined,
  footer: string | undefined,
  buttons: Button[] | URLButton | SectionList | FlowButton | undefined,
): Record<string, unknown> {
  const m: Record<string, unknown> = { body: { text: body } }
  if (header) m.header = { type: 'text', text: header }
  if (footer) m.footer = { text: footer }
  applyButtons(m, buttons)
  return m
}

function buildInteractivePayloadWithHeader(
  body: string,
  footer: string | undefined,
  buttons: Button[] | URLButton | SectionList | FlowButton | undefined,
  header: Record<string, unknown>,
): Record<string, unknown> {
  const m: Record<string, unknown> = { body: { text: body }, header }
  if (footer) m.footer = { text: footer }
  applyButtons(m, buttons)
  return m
}

// ── WhatsApp client ──────────────────────────────────────────────────────────

/**
 * The main entry point for all jswa operations: sending messages, managing
 * templates/flows/groups, and registering webhook handlers.
 *
 * @example Without a webhook (API-only)
 * ```ts
 * const wa = new WhatsApp({ token: 'TOKEN', phoneId: 'PHONE_ID' })
 * const msg = await wa.sendMessage('1234567890', 'Hello from jswa!')
 * ```
 *
 * @example With a webhook (Express)
 * ```ts
 * const wa = new WhatsApp({ token, phoneId, appSecret, verifyToken })
 * wa.onMessage(async (wa, msg) => { await msg.reply('Hi!') }, filterText)
 * app.use('/webhook', express.raw({ type: '*​/*' }), expressWebhook(wa))
 * ```
 */
export class WhatsApp {
  readonly phoneId: string
  readonly businessAccountId?: string
  readonly appId?: string
  readonly continueHandling: boolean
  readonly webhookEndpoint: string

  private readonly appSecret?: string
  private readonly verifyToken?: string
  private readonly filterUpdates: boolean
  private readonly privateKey?: string
  private readonly privateKeyPassword?: string

  private api?: GraphAPI

  private readonly handlers = {
    message: new HandlerList<Message>(),
    callbackButton: new HandlerList<CallbackButton>(),
    callbackSelect: new HandlerList<CallbackSelection>(),
    messageStatus: new HandlerList<import('./types.js').MessageStatus>(),
    chatOpened: new HandlerList<ChatOpened>(),
    flowCompletion: new HandlerList<FlowCompletion>(),
    phoneNumChange: new HandlerList<PhoneNumberChange>(),
    identityChange: new HandlerList<IdentityChange>(),
    tmplStatus: new HandlerList<TemplateStatusUpdate>(),
    tmplCategory: new HandlerList<TemplateCategoryUpdate>(),
    tmplQuality: new HandlerList<TemplateQualityUpdate>(),
    userMktgPrefs: new HandlerList<UserMarketingPreferences>(),
    callConnect: new HandlerList<CallConnect>(),
    callTerminate: new HandlerList<CallTerminate>(),
    callStatus: new HandlerList<CallStatus>(),
    callPermission: new HandlerList<CallPermissionUpdate>(),
    raw: new HandlerList<RawUpdate>(),
  }

  private readonly flowEndpoints = new Map<string, FlowRequestHandlerFunc>()
  private readonly listeners = new ListenerRegistry()
  private readonly seen = new Map<string, number>()
  private readonly webhookProcessor: WebhookProcessor

  constructor(config: Config) {
    this.phoneId = config.phoneId
    if (config.businessAccountId !== undefined) this.businessAccountId = config.businessAccountId
    if (config.appId !== undefined) this.appId = config.appId
    if (config.appSecret !== undefined) this.appSecret = config.appSecret
    if (config.verifyToken !== undefined) this.verifyToken = config.verifyToken
    this.webhookEndpoint = config.webhookEndpoint ?? '/webhook'
    this.filterUpdates = config.filterUpdates ?? true
    this.continueHandling = config.continueHandling ?? false
    if (config.businessPrivateKey !== undefined) this.privateKey = config.businessPrivateKey
    if (config.businessPrivateKeyPassword !== undefined) this.privateKeyPassword = config.businessPrivateKeyPassword

    if (config.token) {
      this.api = new GraphAPI(config.token, config.apiVersion ?? DEFAULT_API_VERSION, config.fetch)
    }

    this.webhookProcessor = new WebhookProcessor(this, {
      ...(this.appSecret !== undefined ? { appSecret: this.appSecret } : {}),
      ...(this.verifyToken !== undefined ? { verifyToken: this.verifyToken } : {}),
      ...(this.filterUpdates ? { phoneId: this.phoneId } : {}),
      dedupe: (id) => this.dedupe(id),
      notifyListeners: (msg) => this.listeners.tryDeliver(this, msg),
      dispatchRaw: (raw) => this.handlers.raw.dispatch(this, raw),
      dispatchMessage: (m) => this.handlers.message.dispatch(this, m),
      dispatchCallbackButton: (cb) => this.handlers.callbackButton.dispatch(this, cb),
      dispatchCallbackSelection: (cs) => this.handlers.callbackSelect.dispatch(this, cs),
      dispatchFlowCompletion: (fc) => this.handlers.flowCompletion.dispatch(this, fc),
      dispatchCallPermission: (cpu) => this.handlers.callPermission.dispatch(this, cpu),
      dispatchChatOpened: (co) => this.handlers.chatOpened.dispatch(this, co),
      dispatchPhoneNumberChange: (pnc) => this.handlers.phoneNumChange.dispatch(this, pnc),
      dispatchIdentityChange: (ic) => this.handlers.identityChange.dispatch(this, ic),
      dispatchMessageStatus: (ms) => this.handlers.messageStatus.dispatch(this, ms),
      dispatchTemplateStatusUpdate: (u) => this.handlers.tmplStatus.dispatch(this, u),
      dispatchTemplateQualityUpdate: (u) => this.handlers.tmplQuality.dispatch(this, u),
      dispatchTemplateCategoryUpdate: (u) => this.handlers.tmplCategory.dispatch(this, u),
      dispatchUserMarketingPreferences: (u) => this.handlers.userMktgPrefs.dispatch(this, u),
    })
  }

  /** Updates the bearer token used for API requests. */
  setToken(token: string): void {
    this.api?.setToken(token)
  }

  /** The raw HTTP layer, for calling endpoints this SDK doesn't wrap yet. */
  get rawApi(): GraphAPI {
    this.requireApi()
    return this.api!
  }

  private requireApi(): void {
    if (!this.api) {
      throw new Error('jswa: no token configured — pass `token` in the Config to call API methods')
    }
  }

  private resolveSender(sender?: string): string {
    const s = sender || this.phoneId
    if (!s) throw new Error('jswa: no phoneId configured — set it in Config or pass `sender` explicitly')
    return s
  }

  private resolveWabaId(wabaId?: string): string {
    const w = wabaId || this.businessAccountId
    if (!w) throw new Error('jswa: no businessAccountId configured — set it in Config or pass `wabaId` explicitly')
    return w
  }

  /** True if this update ID was already dispatched in the last 5 minutes. */
  private dedupe(id: string): boolean {
    const now = Date.now()
    // Prune old entries occasionally.
    if (this.seen.size > 1000) {
      for (const [k, t] of this.seen) if (now - t > DEDUPE_WINDOW_MS) this.seen.delete(k)
    }
    if (this.seen.has(id)) return true
    this.seen.set(id, now)
    return false
  }

  private async resolveMedia(
    media: string | Buffer | Uint8Array,
    mimeType: string | undefined,
    sender: string,
    mediaType: string,
  ): Promise<{ mediaParam: Record<string, unknown>; mediaId?: string }> {
    this.requireApi()
    if (typeof media === 'string') {
      if (isUrl(media)) return { mediaParam: { link: media } }
      // Treat as a local file path.
      const data = await readFile(media)
      const mt = mimeType || mimeTypeFromPath(media)
      const filename = basename(media)
      const mediaId = await this.api!.uploadMedia(sender, data, mt, filename)
      return { mediaParam: { id: mediaId }, mediaId }
    }
    if (!mimeType) throw new Error('jswa: mimeType is required when sending raw bytes')
    const ext = extensionFromMimeType(mimeType)
    const filename = mediaType + ext
    const mediaId = await this.api!.uploadMedia(sender, media, mimeType, filename)
    return { mediaParam: { id: mediaId }, mediaId }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Sending messages
  // ═══════════════════════════════════════════════════════════════════════

  /** Sends a text message, optionally with interactive buttons. */
  async sendMessage(to: string, text: string, opts: SendMessageOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)

    const payload: Record<string, unknown> = { messaging_product: 'whatsapp', to }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    if (opts.tracker) payload.biz_opaque_callback_data = opts.tracker
    if (opts.identityKeyHash) payload.recipient_identity_key_hash = opts.identityKeyHash

    if (!opts.buttons) {
      payload.type = 'text'
      payload.text = { body: text, preview_url: !!opts.previewUrl }
    } else {
      payload.type = 'interactive'
      payload.interactive = buildInteractivePayload(text, opts.header, opts.footer, opts.buttons)
    }

    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Alias for {@link sendMessage}. */
  async sendText(to: string, text: string, opts: SendMessageOptions = {}): Promise<SentMessage> {
    return this.sendMessage(to, text, opts)
  }

  private async sendMedia(
    to: string,
    mediaType: 'image' | 'video' | 'document' | 'audio' | 'sticker',
    media: string | Buffer | Uint8Array,
    caption: string | undefined,
    opts: SendMediaOptions = {},
  ): Promise<SentMediaMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const { mediaParam, mediaId } = await this.resolveMedia(media, opts.mimeType, sender, mediaType)

    if (caption) mediaParam.caption = caption
    if (mediaType === 'document' && opts.filename) mediaParam.filename = opts.filename

    const payload: Record<string, unknown> = { messaging_product: 'whatsapp', to }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    if (opts.tracker) payload.biz_opaque_callback_data = opts.tracker
    if (opts.identityKeyHash) payload.recipient_identity_key_hash = opts.identityKeyHash

    if (!opts.buttons || mediaType === 'sticker' || mediaType === 'audio') {
      payload.type = mediaType
      payload[mediaType] = mediaParam
    } else {
      payload.type = 'interactive'
      payload.interactive = buildInteractivePayloadWithHeader(caption ?? '', opts.footer, opts.buttons, {
        type: mediaType,
        [mediaType]: mediaParam,
      })
    }

    const res = await this.api!.post(`/${sender}/messages`, payload)
    const sent = extractSentMessage(res, sender, to)
    return { ...sent, ...(mediaId ? { mediaId } : {}) }
  }

  /** Sends an image message. `image` may be a URL, local file path, or raw bytes. */
  async sendImage(
    to: string,
    image: string | Buffer | Uint8Array,
    caption?: string,
    opts: SendMediaOptions = {},
  ): Promise<SentMediaMessage> {
    return this.sendMedia(to, 'image', image, caption, opts)
  }

  /** Sends a video message. `video` may be a URL, local file path, or raw bytes. */
  async sendVideo(
    to: string,
    video: string | Buffer | Uint8Array,
    caption?: string,
    opts: SendMediaOptions = {},
  ): Promise<SentMediaMessage> {
    return this.sendMedia(to, 'video', video, caption, opts)
  }

  /** Sends a document message. `document` may be a URL, local file path, or raw bytes. */
  async sendDocument(
    to: string,
    document: string | Buffer | Uint8Array,
    caption?: string,
    opts: SendMediaOptions = {},
  ): Promise<SentMediaMessage> {
    return this.sendMedia(to, 'document', document, caption, opts)
  }

  /** Sends an audio message. `audio` may be a URL, local file path, or raw bytes. */
  async sendAudio(to: string, audio: string | Buffer | Uint8Array, opts: SendMediaOptions = {}): Promise<SentMediaMessage> {
    return this.sendMedia(to, 'audio', audio, undefined, opts)
  }

  /** Sends a voice note. Defaults `mimeType` to `audio/ogg; codecs=opus` if not set. */
  async sendVoice(to: string, voice: string | Buffer | Uint8Array, opts: SendMediaOptions = {}): Promise<SentMediaMessage> {
    return this.sendMedia(to, 'audio', voice, undefined, { mimeType: 'audio/ogg; codecs=opus', ...opts })
  }

  /** Sends a static or animated sticker (WebP). */
  async sendSticker(to: string, sticker: string | Buffer | Uint8Array, opts: SendMediaOptions = {}): Promise<SentMediaMessage> {
    return this.sendMedia(to, 'sticker', sticker, undefined, opts)
  }

  /** Sends an emoji reaction to a previous message. */
  async sendReaction(to: string, emoji: string, messageId: string, opts: SendReactionOptions = {}): Promise<SentReaction> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const res = await this.api!.post(`/${sender}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    })
    return { ...extractSentMessage(res, sender, to), reactedToMessageId: messageId }
  }

  /** Removes a previously sent reaction (sends an empty-emoji reaction). */
  async removeReaction(to: string, messageId: string, opts: RemoveReactionOptions = {}): Promise<SentReaction> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const res = await this.api!.post(`/${sender}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji: '' },
    })
    return { ...extractSentMessage(res, sender, to), reactedToMessageId: messageId }
  }

  /** Sends a location pin. */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
    opts: SendLocationOptions = {},
  ): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'location',
      location: { latitude, longitude, name, address },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends a message with a "Send Location" button. */
  async requestLocation(to: string, text: string, opts: SendLocationOptions = {}): Promise<SentLocationRequest> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: { type: 'location_request_message', body: { text }, action: { name: 'send_location' } },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends a message with a "Share Contact Info" prompt. */
  async requestContactInfo(to: string, text: string, opts: RequestContactInfoOptions = {}): Promise<SentContactInfoRequest> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: { type: 'address_message', body: { text }, action: { name: 'send_address' } },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends one or more contact cards. */
  async sendContact(to: string, contacts: Contact[], opts: SendContactOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'contacts',
      contacts: contacts.map(contactToDict),
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends a pre-approved template message. */
  async sendTemplate(to: string, name: string, language: string, opts: SendTemplateOptions = {}): Promise<SentTemplate> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const components: Record<string, unknown>[] = opts.components ? [...opts.components] : []
    if (opts.headerParams?.length) components.push({ type: 'header', parameters: opts.headerParams })
    if (opts.bodyParams?.length) components.push({ type: 'body', parameters: opts.bodyParams })
    if (opts.buttonParams) {
      for (const [idx, params] of Object.entries(opts.buttonParams)) {
        components.push({ type: 'button', sub_type: 'quick_reply', index: idx, parameters: params })
      }
    }
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name, language: { code: opts.language ?? language }, components },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends the default catalog message for the business's connected catalog. */
  async sendCatalog(to: string, body: string, footer?: string, opts: SendCatalogOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const action: Record<string, unknown> = { name: 'catalog_message' }
    if (opts.thumbnailProductSku) action.parameters = { thumbnail_product_retailer_id: opts.thumbnailProductSku }
    const interactive: Record<string, unknown> = { type: 'catalog_message', body: { text: body }, action }
    if (footer) interactive.footer = { text: footer }
    const payload: Record<string, unknown> = { messaging_product: 'whatsapp', to, type: 'interactive', interactive }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends a single product card from a catalog. */
  async sendProduct(to: string, catalogId: string, sku: string, opts: SendProductOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'product',
        action: { catalog_id: catalogId, product_retailer_id: sku },
      },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends a multi-section product list from a catalog. */
  async sendProducts(
    to: string,
    catalogId: string,
    title: string,
    body: string,
    sections: import('./types.js').ProductsSection[],
    opts: SendProductsOptions = {},
  ): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: title },
        body: { text: body },
        action: { catalog_id: catalogId, sections: sections.map(productsSectionToDict) },
      },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Sends a carousel message (image/video cards with buttons). */
  async sendCarousel(to: string, body: string, cards: CarouselCard[], opts: SendCarouselOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: body },
        action: { cards: cards.map((c, i) => carouselCardToDict(c, i)) },
      },
    }
    if (opts.replyToMessageId) payload.context = { message_id: opts.replyToMessageId }
    const res = await this.api!.post(`/${sender}/messages`, payload)
    return extractSentMessage(res, sender, to)
  }

  /** Marks a message as read. */
  async markMessageAsRead(messageId: string, sender?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(sender)
    await this.api!.post(`/${s}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: messageId })
  }

  /** Marks a message as read and shows the typing indicator. */
  async indicateTyping(messageId: string, sender?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(sender)
    await this.api!.post(`/${s}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Media
  // ═══════════════════════════════════════════════════════════════════════

  /** Uploads media bytes and returns the resulting media ID. */
  async uploadMedia(media: string | Buffer | Uint8Array, mimeType: string, filename: string, phoneId?: string): Promise<string> {
    this.requireApi()
    const sender = this.resolveSender(phoneId)
    const data = typeof media === 'string' ? await readFile(media) : media
    return this.api!.uploadMedia(sender, data, mimeType, filename)
  }

  /** Fetches a temporary (5-minute) download URL + metadata for a media ID. */
  async getMediaUrl(mediaId: string): Promise<MediaURL> {
    this.requireApi()
    const res = await this.api!.get(`/${mediaId}`)
    return {
      id: String(res.id ?? mediaId),
      url: String(res.url ?? ''),
      mimeType: res.mime_type !== undefined ? String(res.mime_type) : undefined,
      sha256: res.sha256 !== undefined ? String(res.sha256) : undefined,
      fileSize: res.file_size !== undefined ? Number(res.file_size) : undefined,
    }
  }

  /** Downloads media bytes to a local file path. Returns the path written to. */
  async downloadMedia(mediaUrl: string, destPath: string): Promise<string> {
    this.requireApi()
    const { writeFile } = await import('node:fs/promises')
    const bytes = await this.api!.getMediaBytes(mediaUrl)
    await writeFile(destPath, bytes)
    return destPath
  }

  /** Downloads media bytes into memory. */
  async getMediaBytes(mediaUrl: string): Promise<Buffer> {
    this.requireApi()
    return this.api!.getMediaBytes(mediaUrl)
  }

  /** Streams media as a Node.js `Readable`. */
  async streamMedia(mediaUrl: string): Promise<Readable> {
    this.requireApi()
    const res = await this.api!.streamMediaResponse(mediaUrl)
    if (!res.body) throw new WhatsAppError({ code: 0, message: 'empty media response body' })
    return Readable.fromWeb(res.body as never)
  }

  /** Deletes uploaded media by ID. */
  async deleteMedia(mediaId: string, phoneId?: string): Promise<void> {
    this.requireApi()
    const params: Record<string, string> = {}
    if (phoneId) params.phone_number_id = phoneId
    await this.api!.delete(`/${mediaId}`, params)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Business profile & phone number management
  // ═══════════════════════════════════════════════════════════════════════

  async getBusinessProfile(phoneId?: string): Promise<import('./types.js').BusinessProfile> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const fields = 'about,address,description,email,websites,vertical,profile_picture_url'
    const res = await this.api!.get(`/${s}/whatsapp_business_profile`, { fields })
    const data = ((res.data as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    return {
      about: data?.about as string | undefined,
      address: data?.address as string | undefined,
      description: data?.description as string | undefined,
      email: data?.email as string | undefined,
      websites: data?.websites as string[] | undefined,
      verticalName: data?.vertical as string | undefined,
      profilePictureId: data?.profile_picture_url as string | undefined,
    }
  }

  async updateBusinessProfile(opts: UpdateBusinessProfileOptions = {}): Promise<void> {
    this.requireApi()
    const sender = this.resolveSender(opts.phoneId)
    const { phoneId: _phoneId, ...fields } = opts
    const data: Record<string, unknown> = { messaging_product: 'whatsapp' }
    if (fields.about !== undefined) data.about = fields.about
    if (fields.address !== undefined) data.address = fields.address
    if (fields.description !== undefined) data.description = fields.description
    if (fields.email !== undefined) data.email = fields.email
    if (fields.websites !== undefined) data.websites = fields.websites
    if (fields.verticalName !== undefined) data.vertical = fields.verticalName
    if (fields.profilePictureHandle !== undefined) data.profile_picture_handle = fields.profilePictureHandle
    await this.api!.post(`/${sender}/whatsapp_business_profile`, data)
  }

  async getBusinessAccount(wabaId?: string): Promise<WhatsAppBusinessAccount> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.get(`/${w}`, { fields: 'id,name,currency,message_template_namespace' })
    return {
      id: String(res.id ?? w),
      name: res.name as string | undefined,
      currency: res.currency as string | undefined,
      messageTemplateNamespace: res.message_template_namespace as string | undefined,
    }
  }

  async getBusinessPhoneNumber(phoneId?: string): Promise<import('./types.js').BusinessPhoneNumber> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const fields =
      'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,is_official_business_account,account_mode'
    const res = await this.api!.get(`/${s}`, { fields })
    return {
      id: String(res.id ?? s),
      displayPhoneNumber: res.display_phone_number as string | undefined,
      verifiedName: res.verified_name as string | undefined,
      qualityRating: res.quality_rating as string | undefined,
      codeVerificationStatus: res.code_verification_status as string | undefined,
      nameStatus: res.name_status as string | undefined,
      isOfficialBizAcct: res.is_official_business_account as boolean | undefined,
      accountMode: res.account_mode as string | undefined,
    }
  }

  async getBusinessPhoneNumbers(
    wabaId?: string,
    pagination?: Pagination,
  ): Promise<Result<import('./types.js').BusinessPhoneNumber>> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.get(`/${w}/phone_numbers`, paginationToQuery(pagination))
    const items: import('./types.js').BusinessPhoneNumber[] = ((res.data as unknown[]) ?? []).map((d) => {
      const r = d as Record<string, unknown>
      return {
        id: String(r.id ?? ''),
        displayPhoneNumber: r.display_phone_number as string | undefined,
        verifiedName: r.verified_name as string | undefined,
        qualityRating: r.quality_rating as string | undefined,
      }
    })
    return new Result({ items, ...this.cursorFrom(res, (after) => this.getBusinessPhoneNumbers(w, { ...pagination, after })) })
  }

  async setBusinessPublicKey(publicKey: string, phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.post(`/${s}/whatsapp_business_encryption`, { business_public_key: publicKey })
  }

  async getBusinessPhoneNumberSettings(phoneId?: string): Promise<import('./types.js').BusinessPhoneNumberSettings> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    return this.api!.get(`/${s}/settings`)
  }

  async updateBusinessPhoneNumberSettings(opts: UpdateBusinessPhoneNumberSettingsOptions = {}): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(opts.phoneId)
    const body: Record<string, unknown> = {}
    if (opts.callingSettings) body.calling = opts.callingSettings
    if (opts.storageConfiguration) body.storage_configuration = opts.storageConfiguration
    await this.api!.post(`/${s}/settings`, body)
  }

  async registerPhoneNumber(pin: string, dataLocalizationRegion?: string, phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const body: Record<string, unknown> = { messaging_product: 'whatsapp', pin }
    if (dataLocalizationRegion) body.data_localization_region = dataLocalizationRegion
    await this.api!.post(`/${s}/register`, body)
  }

  async deregisterPhoneNumber(phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.post(`/${s}/deregister`)
  }

  async updateDisplayName(newDisplayName: string, phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.post(`/${s}`, { new_business_name: newDisplayName })
  }

  async updateConversationalAutomation(
    enableChatOpened: boolean,
    opts: UpdateConversationalAutomationOptions = {},
  ): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(opts.phoneId)
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      enable_welcome_message: enableChatOpened,
    }
    if (opts.commands) body.commands = opts.commands.map(commandToDict)
    if (opts.prompts) body.prompts = opts.prompts
    await this.api!.post(`/${s}/conversational_automation`, body)
  }

  async createPhoneNumber(
    countryCode: string,
    phoneNumber: string,
    verifiedName: string,
    wabaId?: string,
  ): Promise<CreatedBusinessPhoneNumber> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.post(`/${w}/phone_numbers`, {
      cc: countryCode,
      phone_number: phoneNumber,
      verified_name: verifiedName,
    })
    return { id: String(res.id ?? '') }
  }

  async requestVerificationCode(codeMethod: string, languageCode: string, phoneId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${phoneId}/request_code`, { code_method: codeMethod, language: languageCode })
  }

  async verifyPhoneNumber(code: string, phoneId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${phoneId}/verify_code`, { code })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Commerce settings
  // ═══════════════════════════════════════════════════════════════════════

  async getCommerceSettings(phoneId?: string): Promise<CommerceSettings> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/whatsapp_commerce_settings`, { fields: 'is_catalog_visible,is_cart_enabled' })
    const data = ((res.data as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    return { isCatalogVisible: !!data?.is_catalog_visible, isCartEnabled: !!data?.is_cart_enabled }
  }

  async updateCommerceSettings(isCatalogVisible?: boolean, isCartEnabled?: boolean, phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const data: Record<string, unknown> = {}
    if (isCatalogVisible !== undefined) data.is_catalog_visible = isCatalogVisible
    if (isCartEnabled !== undefined) data.is_cart_enabled = isCartEnabled
    await this.api!.post(`/${s}/whatsapp_commerce_settings`, data)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: App / OAuth
  // ═══════════════════════════════════════════════════════════════════════

  async getAppAccessToken(appId: string, appSecret: string): Promise<string> {
    this.requireApi()
    const res = await this.api!.get('/oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'client_credentials',
    })
    return String(res.access_token ?? '')
  }

  async getBusinessAccessToken(appId: string, appSecret: string, code: string): Promise<string> {
    this.requireApi()
    const res = await this.api!.get('/oauth/access_token', { client_id: appId, client_secret: appSecret, code })
    return String(res.access_token ?? '')
  }

  async setAppCallbackURL(
    appId: number,
    appAccessToken: string,
    callbackUrl: string,
    verifyToken: string,
    fields: string[],
  ): Promise<void> {
    const api = new GraphAPI(appAccessToken)
    await api.request('POST', `/${appId}/subscriptions`, {
      params: { object: 'whatsapp_business_account', callback_url: callbackUrl, verify_token: verifyToken, fields: fields.join(',') },
    })
  }

  async overrideWABACallbackURL(callbackUrl: string, verifyToken: string, wabaId?: string): Promise<void> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    await this.api!.post(`/${w}/subscribed_apps`, { override_callback_uri: callbackUrl, verify_token: verifyToken })
  }

  async deleteWABACallbackURL(wabaId?: string): Promise<void> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    await this.api!.delete(`/${w}/subscribed_apps`)
  }

  async overridePhoneCallbackURL(callbackUrl: string, verifyToken: string, phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.post(`/${s}/subscribed_apps`, { override_callback_uri: callbackUrl, verify_token: verifyToken })
  }

  async deletePhoneCallbackURL(phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.delete(`/${s}/subscribed_apps`)
  }

  async getWABASubscribedApps(wabaId?: string): Promise<Record<string, unknown>[]> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.get(`/${w}/subscribed_apps`)
    return (res.data as Record<string, unknown>[]) ?? []
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Templates
  // ═══════════════════════════════════════════════════════════════════════

  async createTemplate(template: Record<string, unknown>, opts: CreateTemplateOptions = {}): Promise<CreatedTemplate> {
    this.requireApi()
    const w = this.resolveWabaId(opts.wabaId)
    const res = await this.api!.post(`/${w}/message_templates`, template)
    return {
      id: String(res.id ?? ''),
      status: String(res.status ?? 'PENDING') as TemplateStatus,
      category: String(res.category ?? '') as import('./types.js').TemplateCategory,
    }
  }

  async deleteTemplate(templateName: string, templateId?: string, wabaId?: string): Promise<void> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const params: Record<string, string> = { name: templateName }
    if (templateId) params.hsm_id = templateId
    await this.api!.delete(`/${w}/message_templates`, params)
  }

  async getTemplate(templateId: string): Promise<TemplateDetails> {
    this.requireApi()
    const res = await this.api!.get(`/${templateId}`)
    return res as unknown as TemplateDetails
  }

  async getTemplates(opts: GetTemplatesOptions = {}): Promise<Result<TemplateDetails>> {
    this.requireApi()
    const w = this.resolveWabaId(opts.wabaId)
    const res = await this.api!.get(`/${w}/message_templates`, paginationToQuery(opts.pagination))
    const items = ((res.data as unknown[]) ?? []) as unknown as TemplateDetails[]
    return new Result({
      items,
      ...this.cursorFrom(res, (after) => this.getTemplates({ ...opts, pagination: { ...opts.pagination, after } })),
    })
  }

  async updateTemplate(templateId: string, opts: UpdateTemplateOptions = {}): Promise<void> {
    this.requireApi()
    const body: Record<string, unknown> = {}
    if (opts.category) body.category = opts.category
    if (opts.components) body.components = opts.components
    await this.api!.post(`/${templateId}`, body)
  }

  async compareTemplates(templateId: string, templateId2: string, start: Date, end: Date): Promise<Record<string, unknown>> {
    this.requireApi()
    return this.api!.get(`/${templateId}/compare`, {
      template_ids: templateId2,
      start: String(Math.floor(start.getTime() / 1000)),
      end: String(Math.floor(end.getTime() / 1000)),
    })
  }

  async unpauseTemplate(templateId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${templateId}/unpause`)
  }

  async migrateTemplates(sourceWabaId: string, pageNumber: number, destinationWabaId?: string): Promise<Record<string, unknown>> {
    this.requireApi()
    const w = this.resolveWabaId(destinationWabaId)
    return this.api!.post(`/${w}/migrate_message_templates`, { source_waba_id: sourceWabaId, page_number: pageNumber })
  }

  async archiveTemplates(templateIds: string[], wabaId?: string): Promise<ArchiveTemplatesResult> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.postFacebookApi<Record<string, unknown>>(`/${w}/message_templates/archive`, {
      template_ids: templateIds,
    })
    const toEntries = (v: unknown): TemplateArchiveEntry[] =>
      ((v as unknown[]) ?? []).map((e) => {
        const r = e as Record<string, unknown>
        return { id: String(r.id ?? ''), name: String(r.name ?? '') }
      })
    return { archivedTemplates: toEntries(res.archived_templates), failedTemplates: toEntries(res.failed_templates) }
  }

  async unarchiveTemplates(templateIds: string[], wabaId?: string): Promise<UnarchiveTemplatesResult> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.postFacebookApi<Record<string, unknown>>(`/${w}/message_templates/unarchive`, {
      template_ids: templateIds,
    })
    const toEntries = (v: unknown): TemplateArchiveEntry[] =>
      ((v as unknown[]) ?? []).map((e) => {
        const r = e as Record<string, unknown>
        return { id: String(r.id ?? ''), name: String(r.name ?? '') }
      })
    return { unarchivedTemplates: toEntries(res.unarchived_templates), failedTemplates: toEntries(res.failed_templates) }
  }

  async upsertAuthenticationTemplate(name: string, opts: UpsertAuthTemplateOptions): Promise<CreatedTemplate[]> {
    this.requireApi()
    const w = this.resolveWabaId(opts.wabaId)
    const results: CreatedTemplate[] = []
    for (const language of opts.languages) {
      const components: Record<string, unknown>[] = [
        { type: 'BODY', add_security_recommendation: opts.addSecurityRecommendation ?? true },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: opts.buttonText ?? 'Copy Code' }],
        },
      ]
      if (opts.codeExpirationMinutes) {
        components.push({ type: 'FOOTER', code_expiration_minutes: opts.codeExpirationMinutes })
      }
      const res = await this.api!.post(`/${w}/message_templates`, {
        name,
        language,
        category: 'AUTHENTICATION',
        components,
      })
      results.push({
        id: String(res.id ?? ''),
        status: String(res.status ?? 'PENDING') as TemplateStatus,
        category: 'AUTHENTICATION',
      })
    }
    return results
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Flows
  // ═══════════════════════════════════════════════════════════════════════

  async createFlow(name: string, categories: FlowCategory[], opts: CreateFlowOptions = {}): Promise<CreatedFlow> {
    this.requireApi()
    const w = this.resolveWabaId(opts.wabaId)
    const body: Record<string, unknown> = { name, categories }
    if (opts.flowJson) body.flow_json = JSON.stringify(opts.flowJson)
    if (opts.endpointUri) body.endpoint_uri = opts.endpointUri
    if (opts.clone !== undefined) body.clone_flow_id = opts.clone
    const res = await this.api!.post(`/${w}/flows`, body)
    return { id: String(res.id ?? '') }
  }

  async publishFlow(flowId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${flowId}/publish`)
  }

  async deleteFlow(flowId: string): Promise<void> {
    this.requireApi()
    await this.api!.delete(`/${flowId}`)
  }

  async deprecateFlow(flowId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${flowId}/deprecate`)
  }

  async getFlow(flowId: string): Promise<FlowDetails> {
    this.requireApi()
    const fields = 'id,name,status,categories,validation_errors,endpoint_uri,preview'
    const res = await this.api!.get(`/${flowId}`, { fields })
    const preview = (res.preview as Record<string, unknown>) ?? {}
    return {
      id: String(res.id ?? flowId),
      name: String(res.name ?? ''),
      status: String(res.status ?? 'DRAFT') as import('./types.js').FlowStatus,
      categories: (res.categories as FlowCategory[]) ?? [],
      validationErrors: res.validation_errors as Record<string, unknown>[] | undefined,
      endpointUri: res.endpoint_uri as string | undefined,
      previewUrl: preview.preview_url as string | undefined,
    }
  }

  async getFlows(wabaId?: string, pagination?: Pagination): Promise<Result<FlowDetails>> {
    this.requireApi()
    const w = this.resolveWabaId(wabaId)
    const res = await this.api!.get(`/${w}/flows`, paginationToQuery(pagination))
    const items = ((res.data as unknown[]) ?? []).map((d) => {
      const r = d as Record<string, unknown>
      return {
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        status: String(r.status ?? 'DRAFT') as import('./types.js').FlowStatus,
        categories: (r.categories as FlowCategory[]) ?? [],
      }
    })
    return new Result({ items, ...this.cursorFrom(res, (after) => this.getFlows(w, { ...pagination, after })) })
  }

  async updateFlowJSON(flowId: string, flowJson: unknown): Promise<Record<string, unknown>[]> {
    this.requireApi()
    const res = await this.api!.post(`/${flowId}/assets`, {
      name: 'flow.json',
      asset_type: 'FLOW_JSON',
      file: JSON.stringify(flowJson),
    })
    return (res.validation_errors as Record<string, unknown>[]) ?? []
  }

  async updateFlowMetadata(flowId: string, opts: UpdateFlowMetadataOptions = {}): Promise<void> {
    this.requireApi()
    const body: Record<string, unknown> = {}
    if (opts.name) body.name = opts.name
    if (opts.categories) body.categories = opts.categories
    if (opts.endpointUri) body.endpoint_uri = opts.endpointUri
    if (opts.applicationId) body.application_id = opts.applicationId
    await this.api!.post(`/${flowId}`, body)
  }

  async getFlowAssets(flowId: string, pagination?: Pagination): Promise<Record<string, unknown>[]> {
    this.requireApi()
    const res = await this.api!.get(`/${flowId}/assets`, paginationToQuery(pagination))
    return (res.data as Record<string, unknown>[]) ?? []
  }

  async migrateFlows(sourceWabaId: string, sourceFlowNames: string[], destinationWabaId?: string): Promise<Record<string, unknown>> {
    this.requireApi()
    const w = this.resolveWabaId(destinationWabaId)
    return this.api!.post(`/${w}/migrate_flows`, { source_waba_id: sourceWabaId, source_flow_names: sourceFlowNames })
  }

  async getFlowMetrics(
    flowId: string,
    metricName: FlowMetricName,
    granularity: FlowMetricGranularity,
    opts: FlowMetricOptions = {},
  ): Promise<Record<string, unknown>> {
    this.requireApi()
    const params: Record<string, string> = { metric_name: metricName, granularity }
    if (opts.start) params.since = opts.start
    if (opts.end) params.until = opts.end
    return this.api!.get(`/${flowId}/metrics`, params)
  }

  /**
   * Registers a handler for WhatsApp Flow data-exchange requests arriving at
   * `endpoint`. Note: request decryption (RSA-OAEP + AES-GCM) must be
   * performed by the adapter before calling the handler — see
   * `adapters/node.ts` for a reference implementation using
   * `businessPrivateKey`.
   */
  registerFlowEndpoint(endpoint: string, handler: FlowRequestHandlerFunc): void {
    this.requireWebhook()
    this.flowEndpoints.set(endpoint, handler)
  }

  /** @internal used by adapters to look up a registered flow endpoint handler. */
  getFlowEndpointHandler(endpoint: string): FlowRequestHandlerFunc | undefined {
    return this.flowEndpoints.get(endpoint)
  }

  /** @internal the configured Flow-decryption private key, if any. */
  getBusinessPrivateKey(): { key?: string; password?: string } {
    return { key: this.privateKey, password: this.privateKeyPassword }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: QR codes
  // ═══════════════════════════════════════════════════════════════════════

  async createQRCode(prefilledMessage: string, imageType: 'PNG' | 'SVG' = 'PNG', phoneId?: string): Promise<QRCode> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.post(`/${s}/message_qrdls`, {
      prefilled_message: prefilledMessage,
      generate_qr_image: imageType,
    })
    return {
      code: String(res.code ?? ''),
      prefilledMessage,
      deepLinkUrl: res.deep_link_url as string | undefined,
      qrImageUrl: res.qr_image_url as string | undefined,
      _client: this,
      _phoneId: s,
    }
  }

  async getQRCode(code: string, imageType: 'PNG' | 'SVG' = 'PNG', phoneId?: string): Promise<QRCode> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/message_qrdls/${code}`, { generate_qr_image: imageType })
    const data = ((res.data as unknown[]) ?? [res])[0] as Record<string, unknown>
    return {
      code: String(data.code ?? code),
      prefilledMessage: data.prefilled_message as string | undefined,
      deepLinkUrl: data.deep_link_url as string | undefined,
      qrImageUrl: data.qr_image_url as string | undefined,
      _client: this,
      _phoneId: s,
    }
  }

  async getQRCodes(imageType: 'PNG' | 'SVG' = 'PNG', phoneId?: string, pagination?: Pagination): Promise<Result<QRCode>> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/message_qrdls`, { generate_qr_image: imageType, ...paginationToQuery(pagination) })
    const items = ((res.data as unknown[]) ?? []).map((d) => {
      const r = d as Record<string, unknown>
      return {
        code: String(r.code ?? ''),
        prefilledMessage: r.prefilled_message as string | undefined,
        deepLinkUrl: r.deep_link_url as string | undefined,
        qrImageUrl: r.qr_image_url as string | undefined,
        _client: this,
        _phoneId: s,
      }
    })
    return new Result({ items, ...this.cursorFrom(res, (after) => this.getQRCodes(imageType, s, { ...pagination, after })) })
  }

  async updateQRCode(code: string, prefilledMessage: string, phoneId?: string): Promise<QRCode> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.post(`/${s}/message_qrdls/${code}`, { prefilled_message: prefilledMessage })
    return this.getQRCode(code, 'PNG', s)
  }

  async deleteQRCode(code: string, phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.delete(`/${s}/message_qrdls/${code}`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Users (block/unblock)
  // ═══════════════════════════════════════════════════════════════════════

  async blockUsers(users: string[], phoneId?: string): Promise<UsersBlockedResult> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.post(`/${s}/block_users`, {
      messaging_product: 'whatsapp',
      block_users: users.map((u) => ({ user: u })),
    })
    const toBlocked = (v: unknown) =>
      ((v as unknown[]) ?? []).map((e) => {
        const r = e as Record<string, unknown>
        return { waId: String(r.wa_id ?? ''), input: String(r.input ?? '') }
      })
    return { addedUsers: toBlocked(res.added_users ?? res.block_users), failedUsers: toBlocked(res.failed_users) }
  }

  async unblockUsers(users: string[], phoneId?: string): Promise<UsersUnblockedResult> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.post(`/${s}/block_users`, {
      messaging_product: 'whatsapp',
      method: 'DELETE',
      block_users: users.map((u) => ({ user: u })),
    })
    const removed = ((res.removed_users as unknown[]) ?? []).map((e) => ({
      waId: String((e as Record<string, unknown>).wa_id ?? ''),
    }))
    return { removedUsers: removed }
  }

  async getBlockedUsers(phoneId?: string, pagination?: Pagination): Promise<Result<User>> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/block_users`, paginationToQuery(pagination))
    const items = ((res.data as unknown[]) ?? []).map((d) => {
      const u = new User({ waId: String((d as Record<string, unknown>).wa_id ?? '') })
      u._client = this
      return u
    })
    return new Result({ items, ...this.cursorFrom(res, (after) => this.getBlockedUsers(s, { ...pagination, after })) })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Calling
  // ═══════════════════════════════════════════════════════════════════════

  async initiateCall(to: string, sdp: SessionDescription, opts: InitiateCallOptions = {}): Promise<InitiatedCall> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      action: 'connect',
      session: sessionDescriptionToDict(sdp),
    }
    if (opts.tracker) body.biz_opaque_callback_data = opts.tracker
    const res = await this.api!.post(`/${sender}/calls`, body)
    const sent = extractSentMessage(res, sender, to)
    return { ...sent, callId: String(res.call_id ?? sent.id) }
  }

  async preAcceptCall(callId: string, sdp: SessionDescription, phoneId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${phoneId}/calls`, {
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'pre_accept',
      session: sessionDescriptionToDict(sdp),
    })
  }

  async acceptCall(callId: string, sdp: SessionDescription, tracker: string | undefined, phoneId: string): Promise<void> {
    this.requireApi()
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      call_id: callId,
      action: 'accept',
      session: sessionDescriptionToDict(sdp),
    }
    if (tracker) body.biz_opaque_callback_data = tracker
    await this.api!.post(`/${phoneId}/calls`, body)
  }

  async rejectCall(callId: string, phoneId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${phoneId}/calls`, { messaging_product: 'whatsapp', call_id: callId, action: 'reject' })
  }

  async terminateCall(callId: string, phoneId: string): Promise<void> {
    this.requireApi()
    await this.api!.post(`/${phoneId}/calls`, { messaging_product: 'whatsapp', call_id: callId, action: 'terminate' })
  }

  async getCallPermissions(waId: string, phoneId: string): Promise<import('./types.js').CallPermissionsResult> {
    this.requireApi()
    return this.api!.get(`/${phoneId}/call_permissions`, { user_wa_id: waId })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Groups
  // ═══════════════════════════════════════════════════════════════════════

  async createGroup(subject: string, opts: CreateGroupOptions = {}): Promise<GroupOperation> {
    this.requireApi()
    const s = this.resolveSender(opts.phoneId)
    const body: Record<string, unknown> = { subject }
    if (opts.description) body.description = opts.description
    if (opts.participants) body.participants = opts.participants
    if (opts.joinApprovalMode) body.join_approval_mode = opts.joinApprovalMode
    const res = await this.api!.post(`/${s}/groups`, body)
    return { requestId: String(res.request_id ?? '') }
  }

  async getGroup(groupId: string): Promise<GroupDetails> {
    this.requireApi()
    const fields = 'id,subject,description,creation_timestamp,suspended,participants,join_approval_mode'
    const res = await this.api!.get(`/${groupId}`, { fields })
    const participants = ((res.participants as unknown[]) ?? []).map((p) => toGroupParticipant(p as Record<string, unknown>, groupId, this))
    return {
      id: String(res.id ?? groupId),
      subject: String(res.subject ?? ''),
      description: res.description as string | undefined,
      creationTimestamp: res.creation_timestamp ? new Date(Number(res.creation_timestamp) * 1000) : undefined,
      suspended: !!res.suspended,
      totalParticipantCount: participants.length,
      participants,
      joinApprovalMode: res.join_approval_mode as GroupJoinApprovalMode | undefined,
      _client: this,
    }
  }

  async getGroups(phoneId?: string, pagination?: Pagination): Promise<Result<GroupDetails>> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/groups`, paginationToQuery(pagination))
    const items = await Promise.all(
      ((res.data as unknown[]) ?? []).map((d) => this.getGroup(String((d as Record<string, unknown>).id ?? ''))),
    )
    return new Result({ items, ...this.cursorFrom(res, (after) => this.getGroups(s, { ...pagination, after })) })
  }

  async deleteGroup(groupId: string): Promise<GroupOperation> {
    this.requireApi()
    const res = await this.api!.delete(`/${groupId}`)
    return { requestId: String(res.request_id ?? '') }
  }

  async updateGroupSettings(groupId: string, opts: UpdateGroupSettingsOptions = {}): Promise<GroupOperation> {
    this.requireApi()
    const body: Record<string, unknown> = {}
    if (opts.subject) body.subject = opts.subject
    if (opts.description) body.description = opts.description
    if (opts.joinApprovalMode) body.join_approval_mode = opts.joinApprovalMode
    const res = await this.api!.post(`/${groupId}`, body)
    return { requestId: String(res.request_id ?? '') }
  }

  async getGroupJoinRequests(groupId: string, pagination?: Pagination): Promise<Result<GroupJoinRequest>> {
    this.requireApi()
    const res = await this.api!.get(`/${groupId}/join_requests`, paginationToQuery(pagination))
    const items = ((res.data as unknown[]) ?? []).map((d) => {
      const r = d as Record<string, unknown>
      const u = toGroupParticipant(r.user as Record<string, unknown>, groupId, this)
      return {
        id: String(r.id ?? ''),
        user: u,
        creationTimestamp: r.creation_timestamp ? new Date(Number(r.creation_timestamp) * 1000) : undefined,
        _groupId: groupId,
        _client: this,
      }
    })
    return new Result({
      items,
      ...this.cursorFrom(res, (after) => this.getGroupJoinRequests(groupId, { ...pagination, after })),
    })
  }

  async approveGroupJoinRequests(groupId: string, requestIds: string[]): Promise<GroupOperation> {
    this.requireApi()
    const res = await this.api!.post(`/${groupId}/join_requests`, { request_ids: requestIds })
    return { requestId: String(res.request_id ?? '') }
  }

  async rejectGroupJoinRequests(groupId: string, requestIds: string[]): Promise<GroupOperation> {
    this.requireApi()
    const res = await this.api!.request('DELETE', `/${groupId}/join_requests`, { body: { request_ids: requestIds } })
    return { requestId: String((res as Record<string, unknown>).request_id ?? '') }
  }

  async getGroupInviteLink(groupId: string): Promise<GroupInviteLink> {
    this.requireApi()
    const res = await this.api!.get(`/${groupId}/invite_link`)
    return { link: String(res.link ?? ''), _groupId: groupId, _client: this }
  }

  async resetGroupInviteLink(groupId: string): Promise<GroupInviteLink> {
    this.requireApi()
    const res = await this.api!.post(`/${groupId}/invite_link`, { messaging_product: 'whatsapp' })
    return { link: String(res.link ?? ''), _groupId: groupId, _client: this }
  }

  async removeGroupParticipants(groupId: string, participants: string[]): Promise<GroupOperation> {
    this.requireApi()
    const res = await this.api!.request('DELETE', `/${groupId}/participants`, { body: { participants } })
    return { requestId: String((res as Record<string, unknown>).request_id ?? '') }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Messages: pin/unpin
  // ═══════════════════════════════════════════════════════════════════════

  async pinMessage(chatId: string, messageId: string, expirationDays?: number, opts: PinMessageOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: chatId,
      type: 'pin_message',
      pin_message: { message_id: messageId, expiration: expirationDays ? `${expirationDays}d` : '24h' },
    }
    const res = await this.api!.post(`/${sender}/messages`, body)
    return extractSentMessage(res, sender, chatId)
  }

  async unpinMessage(chatId: string, messageId: string, opts: PinMessageOptions = {}): Promise<SentMessage> {
    this.requireApi()
    const sender = this.resolveSender(opts.sender)
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: chatId,
      type: 'unpin_message',
      unpin_message: { message_id: messageId },
    }
    const res = await this.api!.post(`/${sender}/messages`, body)
    return extractSentMessage(res, sender, chatId)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Usernames
  // ═══════════════════════════════════════════════════════════════════════

  async setUsername(username: string, opts: SetUsernameOptions = {}): Promise<UsernameStatus> {
    this.requireApi()
    const s = this.resolveSender(opts.phoneId)
    const res = await this.api!.post(`/${s}/username`, { username })
    return { username, status: String(res.status ?? 'PENDING') as import('./types.js').UsernameStatusType }
  }

  async getCurrentUsername(phoneId?: string): Promise<UsernameStatus> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/username`)
    return {
      username: String(res.username ?? ''),
      status: String(res.status ?? 'APPROVED') as import('./types.js').UsernameStatusType,
    }
  }

  async getReservedUsernames(phoneId?: string): Promise<string[]> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    const res = await this.api!.get(`/${s}/username_suggestions`)
    return (res.suggestions as string[]) ?? []
  }

  async deleteUsername(phoneId?: string): Promise<void> {
    this.requireApi()
    const s = this.resolveSender(phoneId)
    await this.api!.delete(`/${s}/username`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: WABA portfolio & account settings
  // ═══════════════════════════════════════════════════════════════════════

  async getSharedBusinessAccounts(portfolioId: string, pagination?: Pagination): Promise<Result<WhatsAppBusinessAccount>> {
    this.requireApi()
    const res = await this.api!.get(`/${portfolioId}/client_whatsapp_business_accounts`, paginationToQuery(pagination))
    const items = ((res.data as unknown[]) ?? []) as unknown as WhatsAppBusinessAccount[]
    return new Result({
      items,
      ...this.cursorFrom(res, (after) => this.getSharedBusinessAccounts(portfolioId, { ...pagination, after })),
    })
  }

  async getOwnedBusinessAccounts(portfolioId: string, pagination?: Pagination): Promise<Result<WhatsAppBusinessAccount>> {
    this.requireApi()
    const res = await this.api!.get(`/${portfolioId}/owned_whatsapp_business_accounts`, paginationToQuery(pagination))
    const items = ((res.data as unknown[]) ?? []) as unknown as WhatsAppBusinessAccount[]
    return new Result({
      items,
      ...this.cursorFrom(res, (after) => this.getOwnedBusinessAccounts(portfolioId, { ...pagination, after })),
    })
  }

  async updateBusinessAccountSettings(opts: UpdateBusinessAccountSettingsOptions = {}): Promise<void> {
    this.requireApi()
    const w = this.resolveWabaId(opts.wabaId)
    const { wabaId: _w, ...settings } = opts
    await this.api!.post(`/${w}`, settings)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Raw escape hatch
  // ═══════════════════════════════════════════════════════════════════════

  /** Calls an arbitrary Graph API endpoint not yet wrapped by this SDK. */
  async sendRawRequest(
    method: string,
    endpoint: string,
    params?: Record<string, string>,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    this.requireApi()
    return this.api!.request(method, endpoint, { ...(params ? { params } : {}), ...(body !== undefined ? { body } : {}) })
  }

  private cursorFrom<T>(
    res: Record<string, unknown>,
    fetchFn: (after: string) => Promise<Result<T>>,
  ): { totalCount?: number; nextCursor?: string; prevCursor?: string; fetchFn?: (after: string) => Promise<Result<T>> } {
    const paging = (res.paging as Record<string, unknown>) ?? {}
    const cursors = (paging.cursors as Record<string, unknown>) ?? {}
    const summary = (res.summary as Record<string, unknown>) ?? {}
    const next = cursors.after ? String(cursors.after) : undefined
    return {
      ...(summary.total_count !== undefined ? { totalCount: Number(summary.total_count) } : {}),
      ...(next ? { nextCursor: next, fetchFn } : {}),
      ...(cursors.before ? { prevCursor: String(cursors.before) } : {}),
    }
  }

  private requireWebhook(): void {
    if (!this.verifyToken) throw new NoWebhookError()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Handler registration
  // ═══════════════════════════════════════════════════════════════════════

  onMessage(callback: HandlerCallback<Message>, ...filters: Filter<Message>[]): void {
    this.addMessageHandler(callback, 0, ...filters)
  }

  addMessageHandler(callback: HandlerCallback<Message>, priority: number, ...filters: Filter<Message>[]): void {
    this.requireWebhook()
    this.handlers.message.add({ callback, filters, priority })
  }

  removeMessageHandler(callback: HandlerCallback<Message>): void {
    this.handlers.message.remove(callback)
  }

  onCallbackButton(callback: HandlerCallback<CallbackButton>, ...filters: Filter<CallbackButton>[]): void {
    this.requireWebhook()
    this.handlers.callbackButton.add({ callback, filters, priority: 0 })
  }

  onCallbackSelection(callback: HandlerCallback<CallbackSelection>, ...filters: Filter<CallbackSelection>[]): void {
    this.requireWebhook()
    this.handlers.callbackSelect.add({ callback, filters, priority: 0 })
  }

  onMessageStatus(
    callback: HandlerCallback<import('./types.js').MessageStatus>,
    ...filters: Filter<import('./types.js').MessageStatus>[]
  ): void {
    this.requireWebhook()
    this.handlers.messageStatus.add({ callback, filters, priority: 0 })
  }

  onChatOpened(callback: HandlerCallback<ChatOpened>, ...filters: Filter<ChatOpened>[]): void {
    this.requireWebhook()
    this.handlers.chatOpened.add({ callback, filters, priority: 0 })
  }

  onFlowCompletion(callback: HandlerCallback<FlowCompletion>, ...filters: Filter<FlowCompletion>[]): void {
    this.requireWebhook()
    this.handlers.flowCompletion.add({ callback, filters, priority: 0 })
  }

  onPhoneNumberChange(callback: HandlerCallback<PhoneNumberChange>): void {
    this.requireWebhook()
    this.handlers.phoneNumChange.add({ callback, filters: [], priority: 0 })
  }

  onIdentityChange(callback: HandlerCallback<IdentityChange>): void {
    this.requireWebhook()
    this.handlers.identityChange.add({ callback, filters: [], priority: 0 })
  }

  onTemplateStatusUpdate(callback: HandlerCallback<TemplateStatusUpdate>): void {
    this.requireWebhook()
    this.handlers.tmplStatus.add({ callback, filters: [], priority: 0 })
  }

  onTemplateCategoryUpdate(callback: HandlerCallback<TemplateCategoryUpdate>): void {
    this.requireWebhook()
    this.handlers.tmplCategory.add({ callback, filters: [], priority: 0 })
  }

  onTemplateQualityUpdate(callback: HandlerCallback<TemplateQualityUpdate>): void {
    this.requireWebhook()
    this.handlers.tmplQuality.add({ callback, filters: [], priority: 0 })
  }

  onUserMarketingPreferences(callback: HandlerCallback<UserMarketingPreferences>): void {
    this.requireWebhook()
    this.handlers.userMktgPrefs.add({ callback, filters: [], priority: 0 })
  }

  onCallConnect(callback: HandlerCallback<CallConnect>): void {
    this.requireWebhook()
    this.handlers.callConnect.add({ callback, filters: [], priority: 0 })
  }

  onCallTerminate(callback: HandlerCallback<CallTerminate>): void {
    this.requireWebhook()
    this.handlers.callTerminate.add({ callback, filters: [], priority: 0 })
  }

  onCallStatus(callback: HandlerCallback<CallStatus>): void {
    this.requireWebhook()
    this.handlers.callStatus.add({ callback, filters: [], priority: 0 })
  }

  onCallPermissionUpdate(callback: HandlerCallback<CallPermissionUpdate>): void {
    this.requireWebhook()
    this.handlers.callPermission.add({ callback, filters: [], priority: 0 })
  }

  onRawUpdate(callback: HandlerCallback<RawUpdate>): void {
    this.requireWebhook()
    this.handlers.raw.add({ callback, filters: [], priority: 0 })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Listeners (conversational flows)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Resolves with the first message matching `opts` from the given sender,
   * or rejects with `ListenerTimeout` / `ListenerCanceled` / `ListenerStopped`.
   */
  async listen(opts: ListenOptions): Promise<Message> {
    this.requireWebhook()
    return listenImpl(this.listeners, this, opts, this.phoneId)
  }

  /** Cancels an active listener for the given sender, rejecting it with `ListenerStopped`. */
  stopListening(senderWaId: string, recipientId?: string, reason?: string): boolean {
    return this.listeners.stop({ senderWaId, recipientId: recipientId || this.phoneId }, reason)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: Webhook processing (delegates to WebhookProcessor)
  // ═══════════════════════════════════════════════════════════════════════

  /** Handles the Meta verification GET request. Returns the challenge string, or `null` if invalid. */
  handleChallenge(mode: string, token: string, challenge: string): string | null {
    return this.webhookProcessor.handleChallenge(mode, token, challenge)
  }

  /** Processes a raw webhook POST body. See `WebhookProcessor.process` for details. */
  async processWebhook(body: Buffer, signature?: string): Promise<ProcessResult> {
    return this.webhookProcessor.process(body, signature)
  }
}

function toGroupParticipant(r: Record<string, unknown> | undefined, groupId: string, client: WhatsApp): GroupParticipant {
  return {
    bsuid: r?.bsuid as string | undefined,
    waId: r?.wa_id as string | undefined,
    username: r?.username as string | undefined,
    parentBsuid: r?.parent_bsuid as string | undefined,
    _groupId: groupId,
    _client: client,
  }
}

export { BaseUpdate }
