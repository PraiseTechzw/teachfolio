// Platform values are read at use time. See the Webdev service/authentication skills.
export const ENV = {
  get appId() { return "teachfolio"; },
  get cookieSecret() { return process.env.SESSION_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get forgeApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get forgeApiKey() { return process.env.MANUS_API_KEY ?? ""; },
  get supabasePublishableKey() { return process.env.SUPABASE_PUBLISHABLE_KEY ?? ""; },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get supabaseUrl() { return process.env.SUPABASE_URL ?? ""; },
  get supabaseSecretKey() { return process.env.SUPABASE_SECRET_KEY ?? ""; },
  get supabaseStorageBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "teachfolio-evidence"; },
};
