/**
 * filters.ts — port of gowa/filters.go
 *
 * A Filter is a predicate deciding whether a handler should fire for a given
 * update. Go's `Filter[T any] func(wa *WhatsApp, update T) bool` maps
 * directly onto a TypeScript generic function type.
 */

import type { WhatsApp } from './client.js'
import type { Message, CallbackButton } from './update.js'
import type { MessageStatus } from './types.js'

/** A predicate over `(wa, update)` deciding whether a handler should fire. */
export type Filter<T> = (wa: WhatsApp, update: T) => boolean

/** A filter that always passes. */
export function always<T>(): Filter<T> {
  return () => true
}

/** A filter that always blocks. */
export function never<T>(): Filter<T> {
  return () => false
}

/** Combines filters with logical AND (short-circuits on the first failure). */
export function and<T>(...filters: Filter<T>[]): Filter<T> {
  return (wa, update) => filters.every((f) => f(wa, update))
}

/** Combines filters with logical OR (short-circuits on the first match). */
export function or<T>(...filters: Filter<T>[]): Filter<T> {
  return (wa, update) => filters.some((f) => f(wa, update))
}

/** Inverts a filter. */
export function not<T>(filter: Filter<T>): Filter<T> {
  return (wa, update) => !filter(wa, update)
}

// ── Message filters ─────────────────────────────────────────────────────────

/** Matches messages that contain a non-empty text body. */
export const filterText: Filter<Message> = (_wa, m) => m.type === 'text' && !!m.text

/** Matches messages that contain an image. */
export const filterImage: Filter<Message> = (_wa, m) => m.type === 'image' && !!m.image

/** Matches messages that contain a video. */
export const filterVideo: Filter<Message> = (_wa, m) => m.type === 'video' && !!m.video

/** Matches messages that contain audio (including voice notes). */
export const filterAudio: Filter<Message> = (_wa, m) => m.type === 'audio' && !!m.audio

/** Matches messages that contain a voice note specifically. */
export const filterVoice: Filter<Message> = (_wa, m) => !!m.audio?.voice

/** Matches messages that contain a document. */
export const filterDocument: Filter<Message> = (_wa, m) => m.type === 'document' && !!m.document

/** Matches messages that contain a sticker. */
export const filterSticker: Filter<Message> = (_wa, m) => m.type === 'sticker' && !!m.sticker

/** Matches messages that contain a location. */
export const filterLocation: Filter<Message> = (_wa, m) => m.type === 'location' && !!m.location

/** Matches messages that contain one or more contact cards. */
export const filterContacts: Filter<Message> = (_wa, m) => m.type === 'contacts' && !!m.contacts?.length

/** Matches messages that are emoji reactions. */
export const filterReaction: Filter<Message> = (_wa, m) => m.type === 'reaction' && !!m.reaction

/** Matches messages that are replies to (or reactions to) another message. */
export const filterReply: Filter<Message> = (_wa, m) => m.isReply

/** Matches messages that were forwarded. */
export const filterForwarded: Filter<Message> = (_wa, m) => m.forwarded

/** Matches any message that has a media attachment. */
export const filterMedia: Filter<Message> = (_wa, m) => m.hasMedia

/** Matches messages from a specific WhatsApp ID. */
export function filterFromWaId(waId: string): Filter<Message> {
  return (_wa, m) => m.from.waId === waId
}

/** Matches text messages whose body contains the given substring (case-sensitive). */
export function filterTextContains(substr: string): Filter<Message> {
  return (_wa, m) => !!m.text?.includes(substr)
}

/** Matches text messages that start with the given prefix. */
export function filterTextPrefix(prefix: string): Filter<Message> {
  return (_wa, m) => !!m.text?.startsWith(prefix)
}

// ── CallbackButton / CallbackSelection filters ──────────────────────────────

/** Matches callback updates whose data equals the given string exactly. */
export function filterCallbackData(data: string): Filter<CallbackButton> {
  return (_wa, cb) => cb.data === data
}

/** Matches callback updates whose data starts with the given prefix. */
export function filterCallbackPrefix(prefix: string): Filter<CallbackButton> {
  return (_wa, cb) => cb.data.startsWith(prefix)
}

// ── MessageStatus filters ───────────────────────────────────────────────────

export const filterStatusSent: Filter<MessageStatus> = (_wa, s) => s.status === 'sent'
export const filterStatusDelivered: Filter<MessageStatus> = (_wa, s) => s.status === 'delivered'
export const filterStatusRead: Filter<MessageStatus> = (_wa, s) => s.status === 'read'
export const filterStatusFailed: Filter<MessageStatus> = (_wa, s) => s.status === 'failed'
