# Changelog

## 0.1.0

Initial experimental distribution of the Chibasko Games integration contract:

- Portable game definitions, explicit online/local capabilities and public participants.
- Integration protocol version 1, independent of the package version.
- Framework-independent client connection contract (state, revisions, subscription, messages).
- Optional React entrypoint with `useChibaskoGame` and lazy module contracts.
- Transport-independent server session and game instance contracts.
- Generic results with nullable winner and optional numeric scores.
- Standalone ESM build, TypeScript declarations and isolated contract/hook tests.

No public compatibility guarantee before 1.0.0. No hosting, authentication, lobby or transport implementation is included.
