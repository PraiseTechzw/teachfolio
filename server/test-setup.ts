// A deterministic test-only key keeps CSRF unit tests independent of a local
// .env file. Production startup still requires an operator-supplied secret.
process.env.SESSION_SECRET ??= "teachfolio-vitest-only-secret-32-bytes";
