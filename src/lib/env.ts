/** Central, typed access to environment configuration. Server-only. */
export const env = {
  databaseUrl: process.env.DATABASE_URL || "",
  dataDir: process.env.DATA_DIR || ".data/pglite",
  uploadDir: process.env.UPLOAD_DIR || ".data/uploads",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-secret-change-me-please-32chars!!",
  demoMode: (process.env.DEMO_MODE ?? "true") !== "false",
  demoPin: process.env.DEMO_PIN || "1448",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  models: {
    vision: process.env.AI_MODEL_VISION || "claude-opus-5-5",
    router: process.env.AI_MODEL_ROUTER || "claude-opus-5-5",
    composer: process.env.AI_MODEL_COMPOSER || "claude-opus-5-5",
    verifier: process.env.AI_MODEL_VERIFIER || "claude-opus-5-5",
    draft: process.env.AI_MODEL_DRAFT || "claude-opus-5-5",
  },
};

export type AgentName = keyof typeof env.models;
