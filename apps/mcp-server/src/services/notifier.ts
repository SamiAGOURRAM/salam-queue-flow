/**
 * LoggingNotifier — MCP server's INotifier adapter (placeholder).
 *
 * No server-side messaging provider is wired yet, so this records the intent to
 * stderr and reports the send as `skipped`. It is the swappable adapter: replace
 * it with a real implementation (e.g. one invoking the Supabase `send-*` Edge
 * Functions) when a provider exists — no handler/booking code changes.
 */
import type { INotifier, NotifyRequest, NotifyResult } from "@queuemed/core";
import { logger } from "../utils/logger.js";

export class LoggingNotifier implements INotifier {
  async notify(request: NotifyRequest): Promise<NotifyResult> {
    logger.info("Notification intent (no provider wired; not delivered)", {
      channel: request.channel,
      type: request.type,
      clinicId: request.clinicId,
      patientId: request.patientId,
      hasPhone: Boolean(request.phoneNumber),
      hasEmail: Boolean(request.email),
    });
    return { id: "mcp-log", status: "skipped" };
  }
}
