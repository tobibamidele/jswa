/**
 * errors.ts — port of gowa/errors.go
 *
 * Go returns (value, error) tuples; TypeScript throws instead. Every failed
 * Graph API call or embedded webhook error surfaces as a `WhatsAppError`.
 */

/** Raw shape of the `"error"` object Meta's Graph API returns on failure. */
export interface WhatsAppErrorData {
  code?: number
  message?: string
  details?: string
  fbTraceId?: string
  href?: string
  subcode?: number
  type?: string
  isTransient?: boolean
  userTitle?: string
  userMsg?: string
  statusCode?: number
}

/**
 * Structured error returned by the WhatsApp Cloud API, or embedded inside an
 * incoming webhook update.
 *
 * Reference:
 *  - https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 *  - https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes
 */
export class WhatsAppError extends Error {
  readonly code: number
  override readonly message: string
  readonly details?: string
  readonly fbTraceId?: string
  readonly href?: string
  readonly subcode?: number
  readonly type?: string
  readonly isTransient?: boolean
  readonly userTitle?: string
  readonly userMsg?: string
  readonly statusCode?: number

  constructor(data: WhatsAppErrorData) {
    const message = data.message ?? ''
    super(
      data.details
        ? `WhatsAppError(code=${data.code ?? 0}): ${message} [${data.details}]`
        : `WhatsAppError(code=${data.code ?? 0}): ${message}`,
    )
    this.name = 'WhatsAppError'
    this.code = data.code ?? 0
    this.message = message
    if (data.details !== undefined) this.details = data.details
    if (data.fbTraceId !== undefined) this.fbTraceId = data.fbTraceId
    if (data.href !== undefined) this.href = data.href
    if (data.subcode !== undefined) this.subcode = data.subcode
    if (data.type !== undefined) this.type = data.type
    if (data.isTransient !== undefined) this.isTransient = data.isTransient
    if (data.userTitle !== undefined) this.userTitle = data.userTitle
    if (data.userMsg !== undefined) this.userMsg = data.userMsg
    if (data.statusCode !== undefined) this.statusCode = data.statusCode
    Object.setPrototypeOf(this, WhatsAppError.prototype)
  }

  /** Classify this error using {@link getErrorKind}. */
  get kind(): ErrorKind {
    return getErrorKind(this.code)
  }
}

/**
 * Builds a {@link WhatsAppError} from the `"error"` sub-object inside a Graph
 * API JSON response, plus the surrounding HTTP status code (0 if the error
 * originated from a webhook payload instead of an HTTP response).
 */
export function whatsAppErrorFromMap(errMap: Record<string, unknown>, statusCode = 0): WhatsAppError {
  const errorData = (errMap.error_data ?? {}) as Record<string, unknown>
  return new WhatsAppError({
    code: typeof errMap.code === 'number' ? errMap.code : Number(errMap.code ?? 0),
    message: errMap.message !== undefined ? String(errMap.message) : '',
    details: errorData.details !== undefined ? String(errorData.details) : undefined,
    fbTraceId: errMap.fbtrace_id !== undefined ? String(errMap.fbtrace_id) : undefined,
    href: errMap.href !== undefined ? String(errMap.href) : undefined,
    subcode: errMap.error_subcode !== undefined ? Number(errMap.error_subcode) : undefined,
    type: errMap.type !== undefined ? String(errMap.type) : undefined,
    isTransient: typeof errMap.is_transient === 'boolean' ? errMap.is_transient : undefined,
    userTitle: errMap.error_user_title !== undefined ? String(errMap.error_user_title) : undefined,
    userMsg: errMap.error_user_msg !== undefined ? String(errMap.error_user_msg) : undefined,
    statusCode: statusCode || undefined,
  })
}

/**
 * Broad classification of a {@link WhatsAppError}, matching pywa's named
 * exception hierarchy (AuthException, ThrottlingError, etc.).
 */
export type ErrorKind =
  | 'general'
  | 'auth'
  | 'rateLimit'
  | 'serviceUnavailable'
  | 'invalidParameter'
  | 'permission'
  | 'paymentIssue'
  | 'messageTooLong'
  | 'invalidFormat'
  | 'flowBlocked'
  | 'flowThrottle'
  | 'flowError'

/** Classifies a Meta error code into an {@link ErrorKind}. */
export function getErrorKind(code: number): ErrorKind {
  if (code === 190) return 'auth'
  if (code === 4 || code === 130429 || code === 131048 || code === 131056) return 'rateLimit'
  if (code === 1 || code === 2 || code === 3 || code === 130472) return 'serviceUnavailable'
  if (code === 100) return 'invalidParameter'
  if (code === 10 || (code >= 200 && code <= 299)) return 'permission'
  if (code === 131042) return 'paymentIssue'
  if (code === 131009) return 'messageTooLong'
  if (code === 131016) return 'invalidFormat'
  if (code === 131043 || code === 131044) return 'flowBlocked'
  if (code === 131045) return 'flowThrottle'
  if (code >= 132000) return 'flowError'
  return 'general'
}

/** Thrown by shortcut methods (e.g. `user.block()`) called on a detached object. */
export class NoClientError extends Error {
  constructor() {
    super('jswa: this object is not associated with a WhatsApp client instance')
    this.name = 'NoClientError'
    Object.setPrototypeOf(this, NoClientError.prototype)
  }
}

/** Thrown when webhook-only functionality (Listen, ListenAndServe) is used without server config. */
export class NoWebhookError extends Error {
  constructor(msg = 'jswa: configure verifyToken to receive webhook updates') {
    super(msg)
    this.name = 'NoWebhookError'
    Object.setPrototypeOf(this, NoWebhookError.prototype)
  }
}

/** Rejects a `listen()` call when no matching update arrives before the deadline. */
export class ListenerTimeout extends Error {
  readonly duration: number
  constructor(durationMs: number) {
    super(`jswa: listener timed out after ${durationMs}ms`)
    this.name = 'ListenerTimeout'
    this.duration = durationMs
    Object.setPrototypeOf(this, ListenerTimeout.prototype)
  }
}

/** Rejects a `listen()` call when a canceler filter matched an incoming update. */
export class ListenerCanceled extends Error {
  readonly update?: unknown
  constructor(update?: unknown) {
    super('jswa: listener cancelled by update')
    this.name = 'ListenerCanceled'
    if (update !== undefined) this.update = update
    Object.setPrototypeOf(this, ListenerCanceled.prototype)
  }
}

/** Rejects a `listen()` call when `stopListening()` is invoked externally. */
export class ListenerStopped extends Error {
  readonly reason?: string
  constructor(reason?: string) {
    super(reason ? `jswa: listener stopped: ${reason}` : 'jswa: listener stopped')
    this.name = 'ListenerStopped'
    if (reason !== undefined) this.reason = reason
    Object.setPrototypeOf(this, ListenerStopped.prototype)
  }
}
