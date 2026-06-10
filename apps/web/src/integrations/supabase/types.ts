/**
 * Supabase database types.
 *
 * The canonical generated schema now lives in @queuemed/core
 * (packages/core/src/types/database.ts) so core, web, and (later) the MCP server
 * share ONE source of truth. This file re-exports it, so existing
 * `@/integrations/supabase/types` imports keep working unchanged.
 *
 * To update after a schema change: regenerate into packages/core/src/types/database.ts.
 */
export type {
  Json,
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "@queuemed/core";

export { Constants } from "@queuemed/core";
