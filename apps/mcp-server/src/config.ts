/**
 * Configuration Module
 * 
 * Centralizes all configuration from environment variables.
 * Validates required values and provides defaults.
 */

import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export interface Config {
  // Environment
  nodeEnv: string;
  logLevel: string;

  // Supabase
  supabaseUrl: string;
  supabaseServiceKey: string;

  // LLM Providers (Phase 3)
  llmDefaultProvider: string;
  groqApiKey?: string;
  groqModel: string;
  ollamaEnabled: boolean;
  ollamaHost: string;
  ollamaModel: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;

  // Web Search (Phase 3)
  tavilyApiKey?: string;

  // Server
  serverPort: number;
}

function getOptionalEnv(key: string, defaultValue: string = ""): string {
  return process.env[key] || defaultValue;
}

function getBoolEnv(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function getIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Validate and export configuration
export const config: Config = {
  // Environment
  nodeEnv: getOptionalEnv("NODE_ENV", "development"),
  logLevel: getOptionalEnv("LOG_LEVEL", "info"),

  // Supabase - Required for production, optional for testing
  supabaseUrl: getOptionalEnv("SUPABASE_URL", ""),
  supabaseServiceKey: getOptionalEnv("SUPABASE_SERVICE_KEY", ""),

  // LLM Providers
  llmDefaultProvider: getOptionalEnv("LLM_DEFAULT_PROVIDER", "groq"),
  groqApiKey: getOptionalEnv("GROQ_API_KEY"),
  groqModel: getOptionalEnv("GROQ_MODEL", "llama-3.3-70b-versatile"),
  ollamaEnabled: getBoolEnv("OLLAMA_ENABLED", false),
  ollamaHost: getOptionalEnv("OLLAMA_HOST", "http://localhost:11434"),
  ollamaModel: getOptionalEnv("OLLAMA_MODEL", "llama3.1:8b"),
  openaiApiKey: getOptionalEnv("OPENAI_API_KEY"),
  anthropicApiKey: getOptionalEnv("ANTHROPIC_API_KEY"),

  // Web Search
  tavilyApiKey: getOptionalEnv("TAVILY_API_KEY"),

  // Server
  serverPort: getIntEnv("SERVER_PORT", 3001),
};

// Log configuration on startup (without sensitive values)
export function logConfig(): void {
  console.error("Configuration loaded:", {
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    supabaseUrl: config.supabaseUrl.substring(0, 30) + "...",
    llmDefaultProvider: config.llmDefaultProvider,
    ollamaEnabled: config.ollamaEnabled,
    serverPort: config.serverPort,
  });
}

