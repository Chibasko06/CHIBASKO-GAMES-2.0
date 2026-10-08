import { randomInt } from 'node:crypto'

export const LOBBY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function normalizeLobbyCode(input: string) {
  const code = input.trim().toUpperCase()
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) throw new Error('INVALID_CODE')
  return code
}
export function createCodeAllocator(generate = () => Array.from({ length: 6 }, () => LOBBY_ALPHABET[randomInt(LOBBY_ALPHABET.length)]).join('')) {
  const issued = new Set<string>()
  return () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = normalizeLobbyCode(generate())
      if (!issued.has(code)) { issued.add(code); return code }
    }
    throw new Error('CODE_UNAVAILABLE')
  }
}
// Tombstones are intentionally retained for the entire process lifetime.
export const allocateLobbyCode = createCodeAllocator()
