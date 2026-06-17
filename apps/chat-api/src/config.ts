/**
 * chat-api configuration (env-driven, with safe defaults).
 */
import dotenv from "dotenv";

dotenv.config();

function str(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isNaN(n) ? fallback : n;
}

export const config = {
  nodeEnv: str("NODE_ENV", "development"),
  port: int("CHAT_API_PORT", 8787),

  /**
   * Supabase project connection for JWT validation.
   * Use the same SUPABASE_URL and SUPABASE_ANON_KEY as the MCP server
   * (see root .env). When unset, auth validation is skipped — a startup
   * warning is emitted so this is never silent in production.
   */
  supabaseUrl: str("SUPABASE_URL"),
  supabaseAnonKey: str("SUPABASE_ANON_KEY"),

  /**
   * Explicit opt-in to allow UNAUTHENTICATED requests when Supabase is not
   * configured. Honored only outside production — a safety valve for local dev,
   * never a production bypass. Default false (fail closed).
   */
  allowUnauthenticated: str("ALLOW_UNAUTHENTICATED").toLowerCase() === "true",

  /** URL of the QueueMed MCP server (Streamable HTTP transport). */
  mcpUrl: str("MCP_SERVER_URL", "http://localhost:3001/mcp"),

  /** LLM provider selection. groq | openai | anthropic. */
  llmProvider: str("LLM_PROVIDER", "groq").toLowerCase(),

  groqApiKey: str("GROQ_API_KEY"),
  groqModel: str("GROQ_MODEL", "llama-3.3-70b-versatile"),
  openaiApiKey: str("OPENAI_API_KEY"),
  openaiModel: str("OPENAI_MODEL", "gpt-4o-mini"),
  anthropicApiKey: str("ANTHROPIC_API_KEY"),
  anthropicModel: str("ANTHROPIC_MODEL", "claude-haiku-4-5"),

  /** Max agent steps (tool-call rounds) per chat turn. */
  maxSteps: int("CHAT_MAX_STEPS", 5),

  /** Retries on a transient provider tool-call rejection (HTTP 400, non-retryable by the SDK). */
  toolCallRetries: int("CHAT_TOOL_CALL_RETRIES", 2),

  /** CORS allow-list (comma-separated). "*" allows any origin. */
  corsOrigins: str("CHAT_API_CORS_ORIGINS", "*"),
};
