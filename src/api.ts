/**
 * api.ts — port of gowa/api.go + gowa/api_v2.go
 *
 * Thin wrapper over the WhatsApp Cloud (Graph) API using Node 18+'s native
 * `fetch`. No HTTP dependency required.
 *
 * CRITICAL (see JSWA_SPEC.md §14): media uploads MUST set the MIME type on
 * the `Blob` passed to `FormData`, not as a plain string field — this is
 * the same `multipart.CreateFormFile` bug gowa had to fix (it hardcoded
 * `application/octet-stream` and WhatsApp rejected the upload with error
 * code 100). `new Blob([data], { type: mimeType })` is the fix.
 */

import { whatsAppErrorFromMap, WhatsAppError } from './errors.js'

const GRAPH_API_BASE = 'https://graph.facebook.com'

export interface GraphAPIRequestOptions {
  params?: Record<string, string>
  body?: unknown
  formData?: FormData
  /** Overrides the base URL entirely (used for the rare `api.facebook.com` endpoints). */
  fullUrl?: string
}

/**
 * Raw HTTP client for the Graph API. `WhatsApp` (client.ts) builds on top of
 * this — application code normally never touches `GraphAPI` directly, but it
 * is exported for advanced use (e.g. `wa.api` for endpoints not yet wrapped).
 */
export class GraphAPI {
  private readonly baseUrl: string
  private token: string
  private readonly version: string
  private readonly fetchImpl: typeof fetch

  constructor(token: string, version = '22.0', fetchImpl?: typeof fetch) {
    this.token = token
    this.version = version
    this.baseUrl = `${GRAPH_API_BASE}/v${version}`
    this.fetchImpl = fetchImpl ?? globalThis.fetch
  }

  setToken(token: string): void {
    this.token = token
  }

  private buildUrl(endpoint: string, params?: Record<string, string>, fullUrl?: string): string {
    const base = fullUrl ?? (endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`)
    const url = new URL(base)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v)
      }
    }
    return url.toString()
  }

  /** Generic request method. Prefer the `get`/`post`/`delete` helpers below. */
  async request<T = Record<string, unknown>>(
    method: string,
    endpoint: string,
    opts: GraphAPIRequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(endpoint, opts.params, opts.fullUrl)
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` }

    let body: BodyInit | undefined
    if (opts.formData) {
      body = opts.formData // fetch sets multipart Content-Type + boundary automatically
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.body)
    }

    const res = await this.fetchImpl(url, { method, headers, body })

    const text = await res.text()
    let parsed: unknown = {}
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { raw: text }
      }
    }

    if (!res.ok) {
      const obj = (parsed as Record<string, unknown>) ?? {}
      const errMap = (obj.error as Record<string, unknown>) ?? obj
      throw whatsAppErrorFromMap(errMap, res.status)
    }

    return parsed as T
  }

  async get<T = Record<string, unknown>>(endpoint: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', endpoint, params ? { params } : {})
  }

  async post<T = Record<string, unknown>>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', endpoint, body !== undefined ? { body } : {})
  }

  async delete<T = Record<string, unknown>>(endpoint: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', endpoint, params ? { params } : {})
  }

  /**
   * Uploads media bytes to `/{phoneId}/media`.
   *
   * The MIME type MUST be set on the `Blob`, not passed as a plain string —
   * the Blob's `type` becomes the multipart part's `Content-Type` header
   * automatically, which is what WhatsApp requires to accept the upload.
   */
  async uploadMedia(phoneId: string, fileData: Buffer | Uint8Array, mimeType: string, filename: string): Promise<string> {
    const formData = new FormData()
    formData.append('messaging_product', 'whatsapp')
    formData.append('type', mimeType)
    const blob = new Blob([fileData as BlobPart], { type: mimeType }) // type on the Blob => Content-Type on the part
    formData.append('file', blob, filename)
    const res = await this.request<{ id: string }>('POST', `/${phoneId}/media`, { formData })
    return res.id
  }

  /** Fetches a temporary (5-minute) media download URL for a media ID. */
  async getMediaUrl(mediaId: string): Promise<Record<string, unknown>> {
    return this.get(`/${mediaId}`)
  }

  /** Streams media bytes from a (already-authorised) download URL. */
  async getMediaBytes(mediaUrl: string): Promise<Buffer> {
    const res = await this.fetchImpl(mediaUrl, { headers: { Authorization: `Bearer ${this.token}` } })
    if (!res.ok) {
      throw new WhatsAppError({ code: res.status, message: `failed to download media: HTTP ${res.status}` })
    }
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /** Streams media as a readable stream (for `streamMedia`). */
  async streamMediaResponse(mediaUrl: string): Promise<Response> {
    const res = await this.fetchImpl(mediaUrl, { headers: { Authorization: `Bearer ${this.token}` } })
    if (!res.ok) {
      throw new WhatsAppError({ code: res.status, message: `failed to stream media: HTTP ${res.status}` })
    }
    return res
  }

  /** Calls `api.facebook.com` instead of `graph.facebook.com` (used by template archive/unarchive). */
  async postFacebookApi<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
    const fullUrl = `https://api.facebook.com/v${this.version}${path}`
    return this.request<T>('POST', path, { fullUrl, ...(body !== undefined ? { body } : {}) })
  }
}
