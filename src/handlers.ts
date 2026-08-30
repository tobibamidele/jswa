/**
 * handlers.ts — port of gowa/handlers.go
 *
 * Python's decorator pattern (`@wa.on_message(filters.text)`) becomes plain
 * method calls: `wa.onMessage(callback, filterText)`. Internally, every
 * update type gets a priority-sorted `HandlerList<T>`.
 */

import type { WhatsApp } from './client.js'
import type { Filter } from './filters.js'

export type HandlerCallback<T> = (wa: WhatsApp, update: T) => Promise<void> | void

export interface HandlerEntry<T> {
  callback: HandlerCallback<T>
  filters: Filter<T>[]
  priority: number
}

function matches<T>(entry: HandlerEntry<T>, wa: WhatsApp, update: T): boolean {
  return entry.filters.every((f) => f(wa, update))
}

/**
 * A priority-sorted list of handlers for one update type. Higher priority
 * runs first; ties keep insertion order (stable sort).
 */
export class HandlerList<T> {
  private handlers: HandlerEntry<T>[] = []

  /** Registers a new handler, keeping the list sorted by descending priority. */
  add(entry: HandlerEntry<T>): void {
    this.handlers.push(entry)
    this.handlers.sort((a, b) => b.priority - a.priority)
  }

  /** Removes the entry whose callback reference matches `cb`. Throws if not found. */
  remove(cb: HandlerCallback<T>): void {
    const idx = this.handlers.findIndex((h) => h.callback === cb)
    if (idx === -1) throw new Error('jswa: handler not registered')
    this.handlers.splice(idx, 1)
  }

  /**
   * Dispatches `update` to every matching handler in priority order. If
   * `wa.continueHandling` is false (the default), dispatch stops after the
   * first handler whose filters all pass.
   */
  async dispatch(wa: WhatsApp, update: T): Promise<void> {
    const snapshot = [...this.handlers]
    for (const h of snapshot) {
      if (matches(h, wa, update)) {
        await h.callback(wa, update)
        if (!wa.continueHandling) return
      }
    }
  }
}
