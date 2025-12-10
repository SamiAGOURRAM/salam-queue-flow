/**
 * Tool Registry
 * 
 * Central registration point for all MCP tools.
 * Tools are organized by domain (clinic, booking, queue, patient, etc.)
 * 
 * Now includes authentication context support for protected tools.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";
import { formatErrorResponse } from "../utils/errors.js";
import type { AuthContext } from "../middleware/auth/index.js";
import {
  ANONYMOUS_CONTEXT,
  canAccessTool,
  assertToolAccess,
} from "../middleware/auth/index.js";

// Import tool definitions and executors
import { clinicSearchTool, executeClinicSearch } from "./clinic/search.js";
import { clinicGetInfoTool, executeClinicGetInfo } from "./clinic/getInfo.js";
import { bookingGetAvailabilityTool, executeBookingGetAvailability } from "./booking/getAvailability.js";
import { bookingCreateTool, executeBookingCreate } from "./booking/create.js";
import { bookingCancelTool, executeBookingCancel } from "./booking/cancel.js";
import { 
  queueGetPositionTool, executeQueueGetPosition,
  queueGetScheduleTool, executeQueueGetSchedule,
  queueCallNextTool, executeQueueCallNext,
} from "./queue/index.js";
import {
  patientGetProfileTool, executePatientGetProfile,
  patientGetAppointmentsTool, executePatientGetAppointments,
} from "./patient/index.js";
import {
  mlEstimateWaitTimeTool, executeMlEstimateWaitTime,
} from "./ml/index.js";

// ============================================
// TOOL EXECUTOR TYPE
// ============================================

/**
 * Tool executor function signature
 * All tools receive args and auth context
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: AuthContext
) => Promise<unknown>;

// ============================================
// TOOL DEFINITIONS
// ============================================

/**
 * All available tools
 */
const tools: Tool[] = [
  // Clinic tools (public)
  clinicSearchTool,
  clinicGetInfoTool,
  
  // Booking tools
  bookingGetAvailabilityTool,
  bookingCreateTool,      // authenticated
  bookingCancelTool,      // authenticated
  
  // Queue tools
  queueGetPositionTool,   // patient: check own position
  queueGetScheduleTool,   // staff: view daily schedule
  queueCallNextTool,      // staff: call next patient
  
  // Patient tools
  patientGetProfileTool,       // patient: view own profile
  patientGetAppointmentsTool,  // patient: view own appointments
  
  // ML tools
  mlEstimateWaitTimeTool,      // patient: estimate wait time
];

// ============================================
// TOOL EXECUTORS
// ============================================

/**
 * Map of tool names to their executor functions
 * Executors now receive AuthContext as second parameter
 */
const executors: Record<string, ToolExecutor> = {
  // Clinic tools
  clinic_search: executeClinicSearch,
  clinic_getInfo: executeClinicGetInfo,
  
  // Booking tools
  booking_getAvailability: executeBookingGetAvailability,
  booking_create: executeBookingCreate,
  booking_cancel: executeBookingCancel,
  
  // Queue tools
  queue_getPosition: executeQueueGetPosition,
  queue_getSchedule: executeQueueGetSchedule,
  queue_callNext: executeQueueCallNext,
  
  // Patient tools
  patient_getProfile: executePatientGetProfile,
  patient_getAppointments: executePatientGetAppointments,
  
  // ML tools
  ml_estimateWaitTime: executeMlEstimateWaitTime,
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all registered tools
 */
export function registerTools(): Tool[] {
  logger.debug("Registering tools", { count: tools.length });
  return tools;
}

/**
 * Execute a tool by name with authentication context
 * 
 * @param name - Tool name to execute
 * @param args - Tool arguments
 * @param context - Authentication context (optional, defaults to anonymous)
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  context: AuthContext = ANONYMOUS_CONTEXT
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const executor = executors[name];

  // Check if tool exists
  if (!executor) {
    logger.warn("Unknown tool requested", { tool: name });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: {
              code: "UNKNOWN_TOOL",
              message: `Tool '${name}' not found. Available tools: ${Object.keys(executors).join(", ")}`,
            },
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  try {
    // Check authorization
    assertToolAccess(context, name);

    logger.debug("Executing tool", { 
      tool: name,
      userId: context.userId,
      role: context.role,
      isAuthenticated: context.isAuthenticated,
    });
    
    // Execute the tool with auth context
    const result = await executor(args, context);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error("Tool execution failed", {
      tool: name,
      userId: context.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    return formatErrorResponse(error);
  }
}

/**
 * Execute a tool with token-based authentication
 * Convenience method that handles token validation
 * 
 * @param name - Tool name
 * @param args - Tool arguments
 * @param token - JWT token (optional)
 */
export async function executeToolWithToken(
  name: string,
  args: Record<string, unknown>,
  token?: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  let context: AuthContext = ANONYMOUS_CONTEXT;

  if (token) {
    try {
      const { validateToken } = await import("../middleware/auth/index.js");
      context = await validateToken(token);
    } catch (error) {
      logger.warn("Token validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with anonymous context for public tools
    }
  }

  return executeToolCall(name, args, context);
}

/**
 * Check if a tool exists
 */
export function hasTool(name: string): boolean {
  return name in executors;
}

/**
 * Get tool definition by name
 */
export function getTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Check if current context can access a tool
 */
export function canExecuteTool(name: string, context: AuthContext): boolean {
  if (!hasTool(name)) {
    return false;
  }
  return canAccessTool(context, name);
}

/**
 * Get list of tools accessible by a given context
 */
export function getAccessibleTools(context: AuthContext): Tool[] {
  return tools.filter(tool => canAccessTool(context, tool.name));
}
