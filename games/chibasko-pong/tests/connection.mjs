// Test host implementing the public SDK facade, without platform internals.
export function createTestConnection({ localPlayerId, getState, send }) {
  let active = true, revision = 0
  const listeners = new Set()
  const notify = () => { revision++; for (const listener of listeners) listener() }
  return {
    connection: Object.freeze({ get localPlayerId() { return active ? localPlayerId : '' },
      getState: () => active ? getState() : null, getSession: () => null,
      getRevision: () => revision,
      subscribe(listener) { if (active) listeners.add(listener); return () => listeners.delete(listener) },
      send(type, payload) { if (active) send(type, payload) },
    }),
    changed() { if (active) notify() },
    dispose() { if (active) { active = false; notify(); listeners.clear() } },
  }
}
