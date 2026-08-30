/**
 * types.ts — port of gowa/types.go + gowa/types_group.go
 *
 * Plain value types shared across the SDK. Go's (value, *client) pattern for
 * "shortcut" methods becomes a plain interface here — the shortcut methods
 * themselves live on the classes in update.ts, or as free functions attached
 * at construction time by the client (see client.ts `attachShortcuts`).
 */

import type { WhatsApp } from './client.js'
import { NoClientError } from './errors.js'
import type { WhatsAppError } from './errors.js'

// ── User ────────────────────────────────────────────────────────────────────

/** A WhatsApp user (sender or contact in a message). */
export class User {
  readonly waId: string
  readonly name: string
  readonly identityKeyHash?: string

  /** @internal */ _client?: WhatsApp

  constructor(data: { waId: string; name?: string; identityKeyHash?: string }) {
    this.waId = data.waId
    this.name = data.name ?? ''
    if (data.identityKeyHash !== undefined) this.identityKeyHash = data.identityKeyHash
  }

  toString(): string {
    return `User(wa_id=${this.waId}, name=${this.name})`
  }

  /** Blocks this user from messaging the business. Shortcut for `wa.blockUsers([waId])`. */
  async block(): Promise<void> {
    if (!this._client) throw new NoClientError()
    await this._client.blockUsers([this.waId])
  }

  /** Unblocks this user. Shortcut for `wa.unblockUsers([waId])`. */
  async unblock(): Promise<void> {
    if (!this._client) throw new NoClientError()
    await this._client.unblockUsers([this.waId])
  }
}

// ── MessageType ─────────────────────────────────────────────────────────────

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'document'
  | 'audio'
  | 'sticker'
  | 'reaction'
  | 'location'
  | 'contacts'
  | 'order'
  | 'interactive'
  | 'button'
  | 'system'
  | 'request_welcome'
  | 'unknown'
  | 'unsupported'

// ── Metadata ────────────────────────────────────────────────────────────────

/** The receiving business phone number's details. */
export interface Metadata {
  displayPhoneNumber: string
  phoneNumberId: string
}

// ── Location ────────────────────────────────────────────────────────────────

export interface Location {
  latitude: number
  longitude: number
  name?: string
  address?: string
  url?: string
}

// ── Reaction ────────────────────────────────────────────────────────────────

export interface Reaction {
  messageId: string
  emoji: string
}

// ── ReplyToMessage ──────────────────────────────────────────────────────────

export interface ReplyToMessage {
  messageId: string
  fromWaId: string
}

// ── Referral ────────────────────────────────────────────────────────────────

/** Click-to-WhatsApp ad information included when a user opens a chat via an ad. */
export interface Referral {
  sourceUrl?: string
  sourceId?: string
  sourceType?: string
  headline?: string
  body?: string
  mediaType?: string
  imageUrl?: string
  videoUrl?: string
  ctwaClid?: string
}

// ── Order ───────────────────────────────────────────────────────────────────

export interface OrderItem {
  productRetailerId: string
  quantity: number
  itemPrice: number
  currency: string
}

/** Sent when a user places an order from a catalog. */
export interface Order {
  catalogId: string
  text?: string
  productItems: OrderItem[]
}

// ── Unsupported ─────────────────────────────────────────────────────────────

export interface Unsupported {
  messageType: string
}

// ── Contact ─────────────────────────────────────────────────────────────────

export interface ContactPhone {
  phone?: string
  waId?: string
  type?: string
}

export interface ContactEmail {
  email?: string
  type?: string
}

export interface ContactURL {
  url?: string
  type?: string
}

export interface ContactAddress {
  street?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  countryCode?: string
  type?: string
}

export interface ContactName {
  formattedName?: string
  firstName?: string
  lastName?: string
  middleName?: string
  suffix?: string
  prefix?: string
}

export interface ContactOrg {
  company?: string
  department?: string
  title?: string
}

/** A rich contact card, as sent/received in a `contacts` message. */
export interface Contact {
  name: ContactName
  phones?: ContactPhone[]
  emails?: ContactEmail[]
  urls?: ContactURL[]
  addresses?: ContactAddress[]
  org?: ContactOrg
  birthday?: string
}

/** Serialises a {@link Contact} into the API JSON payload shape. */
export function contactToDict(c: Contact): Record<string, unknown> {
  const m: Record<string, unknown> = {
    name: {
      formatted_name: c.name.formattedName ?? '',
      first_name: c.name.firstName ?? '',
      last_name: c.name.lastName ?? '',
      middle_name: c.name.middleName ?? '',
      suffix: c.name.suffix ?? '',
      prefix: c.name.prefix ?? '',
    },
  }
  if (c.phones?.length) {
    m.phones = c.phones.map((p) => ({ phone: p.phone, wa_id: p.waId, type: p.type }))
  }
  if (c.emails?.length) {
    m.emails = c.emails.map((e) => ({ email: e.email, type: e.type }))
  }
  if (c.urls?.length) {
    m.urls = c.urls.map((u) => ({ url: u.url, type: u.type }))
  }
  if (c.addresses?.length) {
    m.addresses = c.addresses.map((a) => ({
      street: a.street,
      city: a.city,
      state: a.state,
      zip: a.zip,
      country: a.country,
      country_code: a.countryCode,
      type: a.type,
    }))
  }
  if (c.org?.company) {
    m.org = { company: c.org.company, department: c.org.department, title: c.org.title }
  }
  if (c.birthday) m.birthday = c.birthday
  return m
}

// ── Media types ─────────────────────────────────────────────────────────────

export interface MediaBase {
  id: string
  sha256?: string
  mimeType?: string
  /** @internal */ _client?: WhatsApp
}

export interface Image extends MediaBase {
  caption?: string
}

export interface Video extends MediaBase {
  caption?: string
}

export interface Audio extends MediaBase {
  voice: boolean
}

export interface Document extends MediaBase {
  caption?: string
  filename?: string
}

export interface Sticker extends MediaBase {
  animated: boolean
}

/** A temporary (5-minute) media download URL returned by the Graph API. */
export interface MediaURL {
  id: string
  url: string
  mimeType?: string
  sha256?: string
  fileSize?: number
}

// ── Button types ────────────────────────────────────────────────────────────

/** A quick-reply button (up to 3 per message, 20-char label limit). */
export interface Button {
  id: string
  title: string
}

/** Opens a URL in a browser when tapped. */
export interface URLButton {
  title: string
  url: string
}

/** Initiates a phone call when tapped. */
export interface VoiceCallButton {
  title: string
  phoneNumber: string
}

export interface SectionRow {
  id: string
  title: string
  description?: string
}

export interface Section {
  title: string
  rows: SectionRow[]
}

/** A scrollable list of sections, shown via the "list message" interactive type. */
export interface SectionList {
  buttonText: string
  sections: Section[]
}

export function sectionListToDict(s: SectionList): Record<string, unknown> {
  return {
    button: s.buttonText,
    sections: s.sections.map((sec) => ({
      title: sec.title,
      rows: sec.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
    })),
  }
}

export interface ProductsSection {
  title: string
  skus: string[]
}

export function productsSectionToDict(p: ProductsSection): Record<string, unknown> {
  return {
    title: p.title,
    product_items: p.skus.map((sku) => ({ product_retailer_id: sku })),
  }
}

/** Opens a WhatsApp Flow when tapped. */
export interface FlowButton {
  flowId: string
  flowToken: string
  navigateTo?: string
  flowActionId?: string
  flowData?: Record<string, unknown>
  text: string
}

// ── Callback types ──────────────────────────────────────────────────────────

// (CallbackButton / CallbackSelection classes live in update.ts, since they
// extend BaseUpdate.)

// ── Status ──────────────────────────────────────────────────────────────────

export type MessageStatusType = 'sent' | 'delivered' | 'read' | 'failed' | 'deleted' | 'warning'

/** Fired when the delivery status of a sent message changes. */
export interface MessageStatus {
  id: string
  metadata: Metadata
  status: MessageStatusType
  timestamp: Date
  from: User
  trackerId?: string
  error?: WhatsAppError
}

// ── Business account types ─────────────────────────────────────────────────

export interface BusinessProfile {
  about?: string
  address?: string
  description?: string
  email?: string
  websites?: string[]
  verticalName?: string
  profilePictureId?: string
}

export interface BusinessPhoneNumber {
  id: string
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string
  codeVerificationStatus?: string
  nameStatus?: string
  isOfficialBizAcct?: boolean
  accountMode?: string
}

export interface BusinessPhoneNumberSettings {
  callingSettings?: CallingSettings
  storageConfiguration?: StorageConfiguration
  [key: string]: unknown
}

export interface CommerceSettings {
  isCatalogVisible: boolean
  isCartEnabled: boolean
}

/** A WhatsApp QR code linking directly into a chat with the business. */
export interface QRCode {
  code: string
  prefilledMessage?: string
  deepLinkUrl?: string
  qrImageUrl?: string
  /** @internal */ _client?: WhatsApp
  /** @internal */ _phoneId?: string
}

// ── Flow types ──────────────────────────────────────────────────────────────

export type FlowStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'BLOCKED' | 'THROTTLED'

export type FlowCategory =
  | 'SIGN_UP'
  | 'SIGN_IN'
  | 'APPOINTMENT_BOOKING'
  | 'LEAD_GENERATION'
  | 'CONTACT_US'
  | 'CUSTOMER_SUPPORT'
  | 'SURVEY'
  | 'OTHER'

export interface CreatedFlow {
  id: string
}

export interface FlowDetails {
  id: string
  name: string
  status: FlowStatus
  categories: FlowCategory[]
  validationErrors?: Record<string, unknown>[]
  endpointUri?: string
  previewUrl?: string
}

/** Sent to the business endpoint when a flow needs a data exchange. */
export interface FlowRequest {
  flowToken: string
  action: string
  screen?: string
  data?: Record<string, unknown>
  version?: string
  decryptedAesKey: Buffer
  initialVector: Buffer
  phoneNumberId?: string
}

/** What the business server must return to a {@link FlowRequest}. */
export interface FlowResponse {
  screen?: string
  data?: Record<string, unknown>
  close?: boolean
}

export type FlowMetricName = string
export type FlowMetricGranularity = 'DAY' | 'HOUR'

// ── Template types ──────────────────────────────────────────────────────────

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export type TemplateStatus =
  | 'APPROVED'
  | 'PAUSED'
  | 'DISABLED'
  | 'PENDING'
  | 'REJECTED'
  | 'PENDING_DELETION'
  | 'FLAGGED'
  | 'APPEAL_REQUESTED'
  | 'ARCHIVED'

export interface CreatedTemplate {
  id: string
  status: TemplateStatus
  category: TemplateCategory
}

export interface TemplateDetails {
  id: string
  name: string
  status: TemplateStatus
  category: TemplateCategory
  language: string
  components: Record<string, unknown>[]
  [key: string]: unknown
}

/** A single component parameter used when sending a template message. */
export interface TemplateParam {
  type: string
  raw: Record<string, unknown>
}

// ── Sent-message return types ──────────────────────────────────────────────

export interface SentMessage {
  id: string
  fromPhoneId: string
  to: string
  timestamp: Date
}

export interface SentMediaMessage extends SentMessage {
  mediaId?: string
}

export interface SentReaction extends SentMessage {
  reactedToMessageId: string
}

export type SentLocationRequest = SentMessage
export type SentTemplate = SentMessage
export interface SentContactInfoRequest extends SentMessage {}

// ── System update types ─────────────────────────────────────────────────────

export interface PhoneNumberChange {
  metadata: Metadata
  timestamp: Date
  oldWaId: string
  newWaId: string
}

export interface IdentityChange {
  metadata: Metadata
  timestamp: Date
  from: User
  createdTimestamp?: Date
  hash?: string
}

export interface ChatOpened {
  metadata: Metadata
  timestamp: Date
  from: User
}

// ── Template update events ──────────────────────────────────────────────────

export interface TemplateStatusUpdate {
  templateId: string
  templateName: string
  status: TemplateStatus
  reason?: string
}

export interface TemplateCategoryUpdate {
  templateId: string
  templateName: string
  previousCategory: TemplateCategory
  newCategory: TemplateCategory
}

export interface TemplateQualityUpdate {
  templateId: string
  templateName: string
  qualityScore: string
}

export interface TemplateComponentsUpdate {
  templateId: string
}

export interface UserMarketingPreferences {
  metadata: Metadata
  timestamp: Date
  from: User
  optIn: boolean
}

// ── Calling types ────────────────────────────────────────────────────────────

export interface CallStatus {
  callId: string
  status: string
  from: User
  timestamp: Date
}

export interface CallConnect {
  callId: string
  from: User
  timestamp: Date
}

export interface CallTerminate {
  callId: string
  from: User
  duration: number
  timestamp: Date
}

export interface CallPermissionRequestButton {
  title: string
}

// (CallPermissionUpdate class lives in update.ts, extends BaseUpdate.)

export interface SessionDescription {
  type: string
  sdp: string
}

export function sessionDescriptionToDict(s: SessionDescription): Record<string, unknown> {
  return { type: s.type, sdp: s.sdp }
}

export interface InitiatedCall extends SentMessage {
  callId: string
}

export interface CallPermissionsResult {
  [key: string]: unknown
}

// ── Pagination ───────────────────────────────────────────────────────────────

export interface Pagination {
  limit?: number
  after?: string
  before?: string
}

export function paginationToQuery(p?: Pagination): Record<string, string> {
  const m: Record<string, string> = {}
  if (!p) return m
  if (p.limit) m.limit = String(p.limit)
  if (p.after) m.after = p.after
  if (p.before) m.before = p.before
  return m
}

// ── Result / cursor-paginated list ───────────────────────────────────────────

/** A cursor-paginated result set. Call `nextPage()` to fetch the next batch. */
export class Result<T> {
  items: T[]
  totalCount?: number
  nextCursor?: string
  prevCursor?: string

  private readonly fetchFn?: (after: string) => Promise<Result<T>>

  constructor(data: {
    items: T[]
    totalCount?: number
    nextCursor?: string
    prevCursor?: string
    fetchFn?: (after: string) => Promise<Result<T>>
  }) {
    this.items = data.items
    if (data.totalCount !== undefined) this.totalCount = data.totalCount
    if (data.nextCursor !== undefined) this.nextCursor = data.nextCursor
    if (data.prevCursor !== undefined) this.prevCursor = data.prevCursor
    if (data.fetchFn !== undefined) this.fetchFn = data.fetchFn
  }

  hasNextPage(): boolean {
    return !!this.nextCursor
  }

  async nextPage(): Promise<Result<T>> {
    if (!this.hasNextPage()) throw new Error('jswa: no next page')
    if (!this.fetchFn) throw new Error('jswa: pagination not supported for this result')
    return this.fetchFn(this.nextCursor!)
  }
}

// ── WhatsApp Business Account ────────────────────────────────────────────────

export interface WhatsAppBusinessAccount {
  id: string
  name?: string
  currency?: string
  messageTemplateNamespace?: string
}

// ── Success / user block results ─────────────────────────────────────────────

export interface SuccessResult {
  success: boolean
}

export interface BlockedUser {
  waId: string
  input: string
}

export interface UsersBlockedResult {
  addedUsers: BlockedUser[]
  failedUsers: BlockedUser[]
}

export interface UnblockedUser {
  waId: string
}

export interface UsersUnblockedResult {
  removedUsers: UnblockedUser[]
}

// ── Command ───────────────────────────────────────────────────────────────────

/** A slash-command shown in WhatsApp chat when a user types `/`. */
export interface Command {
  command: string
  description: string
}

export function commandToDict(c: Command): Record<string, unknown> {
  return { command_name: c.command, command_description: c.description }
}

// ── Raw update ────────────────────────────────────────────────────────────────

/** The decoded top-level webhook payload, before classification. */
export type RawUpdate = Record<string, unknown>

// ── Storage / calling settings ────────────────────────────────────────────────

export interface StorageConfiguration {
  storageType: 'EPHEMERAL' | 'PERSISTENT'
}

export interface CallingSettings {
  status: 'ENABLED' | 'DISABLED'
}

// ── Group types (types_group.go) ──────────────────────────────────────────────

export type GroupJoinApprovalMode = 'auto_approve' | 'approval_required'

export interface GroupOperation {
  requestId: string
}

export interface GroupParticipant {
  bsuid?: string
  waId?: string
  username?: string
  parentBsuid?: string
  /** @internal */ _groupId?: string
  /** @internal */ _client?: WhatsApp
}

/** Removes this participant from their group. Shortcut for `wa.removeGroupParticipants`. */
export async function removeGroupParticipant(p: GroupParticipant): Promise<GroupOperation> {
  if (!p._client || !p._groupId) throw new NoClientError()
  return p._client.removeGroupParticipants(p._groupId, [p.bsuid || p.waId || ''])
}

export interface GroupDetails {
  id: string
  subject: string
  description?: string
  creationTimestamp?: Date
  suspended: boolean
  totalParticipantCount: number
  participants: GroupParticipant[]
  joinApprovalMode?: GroupJoinApprovalMode
  /** @internal */ _client?: WhatsApp
}

export interface GroupInviteLink {
  link: string
  /** @internal */ _groupId?: string
  /** @internal */ _client?: WhatsApp
}

export interface GroupJoinRequest {
  id: string
  user: GroupParticipant
  creationTimestamp?: Date
  /** @internal */ _groupId?: string
  /** @internal */ _client?: WhatsApp
}

// ── Username types ────────────────────────────────────────────────────────────

export type UsernameStatusType = 'AVAILABLE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNAVAILABLE'

export interface UsernameStatus {
  username: string
  status: UsernameStatusType
}

// ── Carousel card types ────────────────────────────────────────────────────────

export type CarouselButtons = Button[] | URLButton

export interface ImageCarouselCard {
  kind: 'image'
  image: string
  body?: string
  buttons?: CarouselButtons
}

export interface VideoCarouselCard {
  kind: 'video'
  video: string
  body?: string
  buttons?: CarouselButtons
}

export type CarouselCard = ImageCarouselCard | VideoCarouselCard

function buildCarouselBase(idx: number, body: string | undefined, buttons: CarouselButtons | undefined) {
  const d: Record<string, unknown> = { card_index: idx }
  if (body) d.body = { text: body }
  if (Array.isArray(buttons)) {
    d.action = {
      buttons: buttons.map((btn) => ({
        type: 'quick_reply',
        quick_reply: { id: btn.id, title: btn.title },
      })),
    }
  } else if (buttons) {
    d.action = { name: 'cta_url', parameters: { display_text: buttons.title, url: buttons.url } }
  }
  return d
}

/** Serialises a {@link CarouselCard} into the API JSON payload shape. */
export function carouselCardToDict(c: CarouselCard, idx: number): Record<string, unknown> {
  const d = buildCarouselBase(idx, c.body, c.buttons)
  if (c.kind === 'image') {
    d.header = { type: 'image', image: { link: c.image } }
  } else {
    d.header = { type: 'video', video: { link: c.video } }
  }
  return d
}

// ── Template archive result types ─────────────────────────────────────────────

export interface TemplateArchiveEntry {
  id: string
  name: string
}

export interface ArchiveTemplatesResult {
  archivedTemplates: TemplateArchiveEntry[]
  failedTemplates: TemplateArchiveEntry[]
}

export interface UnarchiveTemplatesResult {
  unarchivedTemplates: TemplateArchiveEntry[]
  failedTemplates: TemplateArchiveEntry[]
}

// ── Phone number provisioning ─────────────────────────────────────────────────

export interface CreatedBusinessPhoneNumber {
  id: string
}
