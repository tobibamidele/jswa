/**
 * update.ts — port of gowa/update.go + gowa/reply_shortcuts.go
 *
 * Go embeds `BaseUserUpdate` in concrete update structs and hangs shortcut
 * methods off the embedded type via Go's promotion rules. TypeScript has no
 * struct embedding, so `BaseUpdate` is a real base class and every update
 * type extends it.
 */

import { NoClientError } from './errors.js'
import type { WhatsApp } from './client.js'
import type { Filter } from './filters.js'
import type {
  Contact,
  Metadata,
  MessageType,
  Image,
  Video,
  Audio,
  Document,
  Sticker,
  Reaction,
  Location,
  Order,
  Referral,
  Unsupported,
  ReplyToMessage,
  SentMessage,
  SentMediaMessage,
  SentReaction,
  SentLocationRequest,
  SentTemplate,
  User,
} from './types.js'
import type {
  SendMessageOptions,
  SendMediaOptions,
  SendCatalogOptions,
  SendProductOptions,
  SendTemplateOptions,
} from './client.js'
import type { WhatsAppError } from './errors.js'

/** Anything that can be sent as media: a URL, a local file path, or raw bytes. */
export type MediaInput = string | Buffer | Uint8Array

/**
 * Common fields and shortcut methods present on every user-originated update
 * (`Message`, `CallbackButton`, `CallbackSelection`, `FlowCompletion`, …).
 */
export class BaseUpdate {
  readonly id: string
  readonly metadata: Metadata
  readonly from: User
  readonly timestamp: Date

  /** @internal set by the client when the update is constructed */
  _client?: WhatsApp

  constructor(data: { id: string; metadata: Metadata; from: User; timestamp: Date }) {
    this.id = data.id
    this.metadata = data.metadata
    this.from = data.from
    this.timestamp = data.timestamp
  }

  private client(): WhatsApp {
    if (!this._client) throw new NoClientError()
    return this._client
  }

  /** Marks the originating message as read. */
  async markAsRead(): Promise<void> {
    await this.client().markMessageAsRead(this.id)
  }

  /** Marks the originating message as read and shows a typing indicator. */
  async indicateTyping(): Promise<void> {
    await this.client().indicateTyping(this.id)
  }

  /** Sends an emoji reaction to the originating message. */
  async react(emoji: string): Promise<SentReaction> {
    return this.client().sendReaction(this.from.waId, emoji, this.id, { sender: this.metadata.phoneNumberId })
  }

  /** Removes the emoji reaction from the originating message. */
  async unreact(): Promise<SentReaction> {
    return this.client().removeReaction(this.from.waId, this.id, { sender: this.metadata.phoneNumberId })
  }

  /** Blocks the user who sent this update. */
  async blockSender(): Promise<void> {
    await this.client().blockUsers([this.from.waId])
  }

  /** Sends a text reply quoting the originating message. */
  async reply(
    text: string,
    opts: Omit<SendMessageOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMessage> {
    return this.client().sendMessage(this.from.waId, text, {
      ...opts,
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /** Sends an image that quotes the originating message. */
  async replyImage(
    image: MediaInput,
    caption?: string,
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMediaMessage> {
    return this.client().sendImage(this.from.waId, image, caption, this.mergeMediaOpts(opts))
  }

  /** Sends a video that quotes the originating message. */
  async replyVideo(
    video: MediaInput,
    caption?: string,
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMediaMessage> {
    return this.client().sendVideo(this.from.waId, video, caption, this.mergeMediaOpts(opts))
  }

  /** Sends a document that quotes the originating message. */
  async replyDocument(
    document: MediaInput,
    caption?: string,
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMediaMessage> {
    return this.client().sendDocument(this.from.waId, document, caption, this.mergeMediaOpts(opts))
  }

  /** Sends an audio message that quotes the originating message. */
  async replyAudio(
    audio: MediaInput,
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMediaMessage> {
    return this.client().sendAudio(this.from.waId, audio, this.mergeMediaOpts(opts))
  }

  /** Sends a voice note (OGG/OPUS) that quotes the originating message. */
  async replyVoice(
    voice: MediaInput,
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMediaMessage> {
    return this.client().sendVoice(this.from.waId, voice, this.mergeMediaOpts(opts))
  }

  /** Sends a sticker (WebP) that quotes the originating message. */
  async replySticker(
    sticker: MediaInput,
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMediaMessage> {
    return this.client().sendSticker(this.from.waId, sticker, this.mergeMediaOpts(opts))
  }

  /** Sends a location message that quotes the originating message. */
  async replyLocation(lat: number, lng: number, name?: string, address?: string): Promise<SentMessage> {
    return this.client().sendLocation(this.from.waId, lat, lng, name, address, {
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /** Sends a location-request message (with a "Send Location" button) that quotes this update. */
  async replyLocationRequest(text: string): Promise<SentLocationRequest> {
    return this.client().requestLocation(this.from.waId, text, {
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /** Sends one or more contact cards that quote the originating message. */
  async replyContact(contacts: Contact[]): Promise<SentMessage> {
    return this.client().sendContact(this.from.waId, contacts, {
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /** Sends a catalog message that quotes the originating message. */
  async replyCatalog(
    body: string,
    footer?: string,
    opts: Omit<SendCatalogOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMessage> {
    return this.client().sendCatalog(this.from.waId, body, footer, {
      ...opts,
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /** Sends a single product card that quotes the originating message. */
  async replyProduct(
    catalogId: string,
    sku: string,
    opts: Omit<SendProductOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentMessage> {
    return this.client().sendProduct(this.from.waId, catalogId, sku, {
      ...opts,
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /** Sends a template message that quotes the originating message. */
  async replyTemplate(
    name: string,
    language: string,
    opts: Omit<SendTemplateOptions, 'replyToMessageId' | 'sender'> = {},
  ): Promise<SentTemplate> {
    return this.client().sendTemplate(this.from.waId, name, language, {
      ...opts,
      replyToMessageId: this.id,
      sender: this.metadata.phoneNumberId,
    })
  }

  /**
   * Blocks until the sender sends another matching message, or the timeout
   * expires. Rejects with `ListenerTimeout`, `ListenerCanceled`, or
   * `ListenerStopped`.
   */
  async waitForReply(filter?: Filter<Message>, timeoutMs?: number): Promise<Message> {
    return this.client().listen({
      senderWaId: this.from.waId,
      recipientId: this.metadata.phoneNumberId,
      ...(filter !== undefined ? { filter } : {}),
      ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
    })
  }

  private mergeMediaOpts(
    opts: Omit<SendMediaOptions, 'replyToMessageId' | 'sender'>,
  ): SendMediaOptions {
    return { ...opts, replyToMessageId: this.id, sender: this.metadata.phoneNumberId }
  }
}

/** Received when a user sends a message of any content type. */
export class Message extends BaseUpdate {
  type: MessageType
  replyToMessage?: ReplyToMessage
  forwarded = false
  forwardedManyTimes = false

  text?: string
  image?: Image
  video?: Video
  sticker?: Sticker
  document?: Document
  audio?: Audio
  reaction?: Reaction
  location?: Location
  contacts?: Contact[]
  order?: Order
  referral?: Referral
  unsupported?: Unsupported
  error?: WhatsAppError

  constructor(
    base: { id: string; metadata: Metadata; from: User; timestamp: Date },
    data: { type: MessageType } & Partial<Message>,
  ) {
    super(base)
    this.type = data.type
    Object.assign(this, data)
  }

  /** The audio field, but only when it's a voice note. */
  get voice(): Audio | undefined {
    return this.audio?.voice ? this.audio : undefined
  }

  /** True when the message contains any media attachment. */
  get hasMedia(): boolean {
    return !!(this.image || this.video || this.sticker || this.document || this.audio)
  }

  /** True when this message is a reply or reaction to another message. */
  get isReply(): boolean {
    return !!this.replyToMessage || !!this.reaction
  }

  /** The caption on an image/video/document message, if any. */
  get caption(): string | undefined {
    return this.image?.caption ?? this.video?.caption ?? this.document?.caption
  }
}

/** Received when a user taps a quick-reply button. */
export class CallbackButton extends BaseUpdate {
  title: string
  data: string

  constructor(base: { id: string; metadata: Metadata; from: User; timestamp: Date }, title: string, data: string) {
    super(base)
    this.title = title
    this.data = data
  }
}

/** Received when a user selects a row from a list message. */
export class CallbackSelection extends BaseUpdate {
  title: string
  data: string
  description?: string

  constructor(
    base: { id: string; metadata: Metadata; from: User; timestamp: Date },
    title: string,
    data: string,
    description?: string,
  ) {
    super(base)
    this.title = title
    this.data = data
    if (description !== undefined) this.description = description
  }
}

/** Received when a user completes (submits) a WhatsApp Flow. */
export class FlowCompletion extends BaseUpdate {
  flowToken: string
  response: Record<string, unknown>

  constructor(
    base: { id: string; metadata: Metadata; from: User; timestamp: Date },
    flowToken: string,
    response: Record<string, unknown>,
  ) {
    super(base)
    this.flowToken = flowToken
    this.response = response
  }
}

/** Received when a user responds to a call-permission request. */
export class CallPermissionUpdate extends BaseUpdate {
  response: string

  constructor(base: { id: string; metadata: Metadata; from: User; timestamp: Date }, response: string) {
    super(base)
    this.response = response
  }
}
