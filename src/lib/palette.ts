/**
 * Canonical agent color palette — 16 muted, editorial hues spanning the wheel,
 * tuned to stay distinct on the warm paper canvas without going neon.
 *
 * This is the single source of truth for agent colors: the mock agents read it,
 * and `normalizeTick()` falls back to it when a backend omits `color`.
 */

export interface PaletteEntry {
  /** Display name (used in legends / tooltips). */
  readonly name: string
  /** Primary line/identity color. */
  readonly hex: string
}

export const AGENT_PALETTE: readonly PaletteEntry[] = [
  { name: 'Terracotta', hex: '#c2603f' },
  { name: 'Amber', hex: '#cf922f' },
  { name: 'Brass', hex: '#a98b38' },
  { name: 'Olive', hex: '#879548' },
  { name: 'Leaf', hex: '#5b8a4f' },
  { name: 'Emerald', hex: '#3d8a6c' },
  { name: 'Teal', hex: '#3a8492' },
  { name: 'Steel', hex: '#4a78a4' },
  { name: 'Indigo', hex: '#5364a6' },
  { name: 'Violet', hex: '#7360a2' },
  { name: 'Plum', hex: '#92568f' },
  { name: 'Mauve', hex: '#a9577f' },
  { name: 'Rose', hex: '#b8536a' },
  { name: 'Brick', hex: '#b14a45' },
  { name: 'Taupe', hex: '#7c6f5d' },
  { name: 'Slate', hex: '#5d736d' },
] as const

/** Stable color for an agent id (1-based). Wraps if id exceeds the palette. */
export function colorForAgent(id: number): string {
  const index = (Math.max(1, Math.floor(id)) - 1) % AGENT_PALETTE.length
  return AGENT_PALETTE[index].hex
}

/** Translucent variant of a hex color, for fills/glows. `alpha` is 0..1. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
