// `server-only` throws outside a React Server Component context. The feed module is
// server-only for real, but a test importing it is not a client leak — stub the guard.
export {}
