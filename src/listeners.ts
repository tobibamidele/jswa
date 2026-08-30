/**
 * listeners.ts — port of gowa/listeners.go
 *
 * A blocking "wait for the next matching update" primitive used inside
 * handlers to implement conversational flows. Go blocks a goroutine on a
 * channel; TypeScript resolves/rejects a Promise instead.
 */

import { ListenerCanceled, ListenerStopped, ListenerTimeout } from './errors.js'
import type { Filter } from './filters.js'
import type { Message } from './update.js'

/** Uniquely identifies a pending listener: (sender, receiving phone number). */
export interface ListenerKey {
  senderWaId: string
  recipientId: string
}

function keyOf(k: ListenerKey): string {
  return `${k.senderWaId}:${k.recipientId}`
}

interface ListenerEntry {
  resolve: (msg: Message) => void
  reject: (err: Error) => void
  filter?: Filter<Message>
  canceler?: Filter<Message>
  timer?: ReturnType<typeof setTimeout>
}

/** Options for `WhatsApp.listen()`. */
export interface ListenOptions {
  /** WA ID of the user to wait for a message from (required). */
  senderWaId: string
  /** Business phone number ID receiving the update (defaults to `config.phoneId`). */
  recipientId?: string
  /** Only resolves when this filter passes (default: accept any message). */
  filter?: Filter<Message>
  /** Rejects with `ListenerCanceled` as soon as this filter matches. */
  canceler?: Filter<Message>
  /** Maximum time to wait, in milliseconds. Omit for no timeout. */
  timeout?: number
  /** Optional external abort signal. */
  signal?: AbortSignal
}

/**
 * Manages the map of pending listeners for one `WhatsApp` client instance.
 * The webhook dispatcher calls `tryDeliver` before running normal handlers —
 * a message consumed by a listener never reaches `onMessage` handlers.
 */
export class ListenerRegistry {
  private listeners = new Map<string, ListenerEntry>()

  register(key: ListenerKey, entry: ListenerEntry): void {
    this.listeners.set(keyOf(key), entry)
  }

  unregister(key: ListenerKey): void {
    this.listeners.delete(keyOf(key))
  }

  get size(): number {
    return this.listeners.size
  }

  /**
   * Called by the webhook dispatcher for every incoming message. Returns
   * true if a listener consumed the message (normal handler dispatch should
   * be skipped for it), matching pywa/gowa behaviour.
   */
  tryDeliver(wa: unknown, msg: Message): boolean {
    const k = keyOf({ senderWaId: msg.from.waId, recipientId: msg.metadata.phoneNumberId })
    const entry = this.listeners.get(k)
    if (!entry) return false

    if (entry.canceler && entry.canceler(wa as any, msg)) {
      entry.reject(new ListenerCanceled(msg))
      return true
    }
    if (!entry.filter || entry.filter(wa as any, msg)) {
      entry.resolve(msg)
      return true
    }
    return false
  }

  stop(key: ListenerKey, reason?: string): boolean {
    const entry = this.listeners.get(keyOf(key))
    if (!entry) return false
    entry.reject(new ListenerStopped(reason))
    return true
  }
}

/**
 * Blocks (via Promise) until a matching message arrives from the given
 * sender, or until timeout/cancellation/stop. Intended to be called from
 * `WhatsApp.listen()`.
 */
export function listen(
  registry: ListenerRegistry,
  wa: unknown,
  opts: ListenOptions,
  defaultRecipientId: string,
): Promise<Message> {
  const recipientId = opts.recipientId || defaultRecipientId
  if (!opts.senderWaId) {
    return Promise.reject(new Error('jswa: listen() requires senderWaId'))
  }
  const key: ListenerKey = { senderWaId: opts.senderWaId, recipientId }

  return new Promise<Message>((resolve, reject) => {
    const entry: ListenerEntry = {
      resolve: (msg) => {
        cleanup()
        resolve(msg)
      },
      reject: (err) => {
        cleanup()
        reject(err)
      },
      ...(opts.filter !== undefined ? { filter: opts.filter } : {}),
      ...(opts.canceler !== undefined ? { canceler: opts.canceler } : {}),
    }

    const cleanup = () => {
      registry.unregister(key)
      if (entry.timer) clearTimeout(entry.timer)
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      entry.reject(new ListenerStopped('aborted'))
    }

    if (opts.timeout && opts.timeout > 0) {
      entry.timer = setTimeout(() => {
        entry.reject(new ListenerTimeout(opts.timeout!))
      }, opts.timeout)
    }
    if (opts.signal) {
      if (opts.signal.aborted) {
        entry.reject(new ListenerStopped('aborted'))
        return
      }
      opts.signal.addEventListener('abort', onAbort)
    }

    registry.register(key, entry)
  })
}
