function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type AppConfig = {
  maxSpecBytes: number;
  maxOperations: number;
  minTasks: number;
  maxTasks: number;
  maxTaskChars: number;
  rateLimitPerIp: number;
  rateLimitGlobal: number;
  rateLimitSalt: string;
  maxAgentSteps: number;
  taskTimeoutMs: number;
  stepTimeoutMs: number;
  groqModel: string;
  groqFallbackModel: string;
  geminiModel: string;
  geminiFallbackModel: string;
  geminiThinkingLevel: string;
  adminToken: string;
  siteUrl: string;
  hasGroq: boolean;
  hasGemini: boolean;
  allowStub: boolean;
  databaseUrl?: string;
};

export function getConfig(): AppConfig {
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const production = process.env.NODE_ENV === "production";
  const allowStub =
    process.env.ALLOW_STUB_LLM === "1" || (!production && !hasGroq && !hasGemini);

  return {
    maxSpecBytes: intEnv("MAX_SPEC_BYTES", 1_500_000),
    maxOperations: intEnv("MAX_OPERATIONS", 40),
    minTasks: 3,
    maxTasks: 10,
    maxTaskChars: 500,
    rateLimitPerIp: intEnv("RATE_LIMIT_PER_IP_DAILY", 8),
    rateLimitGlobal: intEnv("RATE_LIMIT_GLOBAL_DAILY", 200),
    rateLimitSalt: process.env.RATE_LIMIT_SALT || "apiproof",
    maxAgentSteps: intEnv("MAX_AGENT_STEPS", 6),
    taskTimeoutMs: intEnv("TASK_TIMEOUT_MS", 40_000),
    stepTimeoutMs: intEnv("STEP_TIMEOUT_MS", 18_000),
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    groqFallbackModel: process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash",
    geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || "",
    adminToken: process.env.ADMIN_TOKEN || "",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    hasGroq,
    hasGemini,
    allowStub,
    databaseUrl: process.env.DATABASE_URL,
  };
}
