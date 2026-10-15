export type LobbyVisibility = 'public' | 'private'
export type PublicLobbySummary = { code: string; gameId: string; host: { username: string; avatarUrl: string | null }; currentPlayers: number; maxPlayers: number }

// Single-process, ephemeral snapshots only. No Room references, identities or seats.
export class PublicLobbyDirectory {
  private entries = new Map<string, { summary: PublicLobbySummary; until: number }>()
  update(code: string, summary: PublicLobbySummary | null, until = 0) {
    if (!summary) { this.entries.delete(code); return }
    this.entries.set(code, { summary: { code, gameId: summary.gameId, host: { username: summary.host.username, avatarUrl: summary.host.avatarUrl },
      currentPlayers: summary.currentPlayers, maxPlayers: summary.maxPlayers }, until })
  }
  list(gameId: string, now = Date.now()) {
    const result: PublicLobbySummary[] = []
    for (const [code, entry] of this.entries) {
      if (entry.until <= now) { this.entries.delete(code); continue }
      if (entry.summary.gameId === gameId && result.length < 50) result.push({ ...entry.summary, host: { ...entry.summary.host } })
    }
    return result
  }
  remove(code: string) { this.entries.delete(code) }
  clear() { this.entries.clear() }
}
