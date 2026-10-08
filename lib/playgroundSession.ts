type Session = { access_token: string; user: { id: string } }
type Connection = { leave(): Promise<unknown> }

// Keep pending joins bound to the account that initiated them.
export function createPlaygroundSession<T extends Connection>(
  getSession: () => Promise<Session | null>,
  join: (token: string) => Promise<T>,
) {
  let generation = 0
  let userId: string | null = null
  let room: T | null = null
  let disposed = false
  const close = () => {
    generation++
    const old = room
    room = null
    void old?.leave().catch(() => {})
  }
  return {
    async connect() {
      const attempt = ++generation
      const session = await getSession()
      if (disposed || attempt !== generation) return null
      if (!session) throw new Error('Sign in required')
      userId = session.user.id
      const next = await join(session.access_token)
      if (disposed || attempt !== generation) { await next.leave(); return null }
      room = next
      return next
    },
    accountChanged(next: string | null) {
      if (!next || next !== userId) close()
      userId = next
    },
    disconnect: close,
    dispose() { disposed = true; close() },
  }
}
