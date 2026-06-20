/** Minimal className combiner — joins truthy strings, drops falsy values. */
export type ClassValue = string | false | null | undefined

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
