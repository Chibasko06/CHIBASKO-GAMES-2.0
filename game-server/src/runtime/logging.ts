// Never serialize errors, request objects or caller-supplied strings.
export type LogEvent = 'server_started' | 'server_shutdown_started' | 'server_shutdown_completed' | 'fatal_error' | 'room_unexpected_error' | 'cleanup_error' | 'coordinator_error' | 'sdk_error'
export function safeLog(event: LogEvent) { console.info(JSON.stringify({ event })) }
export const sdkLogger = {
  debug() {}, trace() {}, info() {}, warn() {},
  error() { safeLog('sdk_error') },
}
