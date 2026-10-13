// Admin security tests exercise the real route guard, never the R2 test stub.
process.env.TEST_REAL_ADMIN = '1'
await import('./register.mjs')
