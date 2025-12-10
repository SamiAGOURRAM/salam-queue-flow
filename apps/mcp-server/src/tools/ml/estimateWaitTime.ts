/**
 * ML Wait Time Estimation Tool
 * 
 * Estimates wait time for a patient's appointment using rule-based calculations.
 * 
 * **Requires authentication** - patients can check their own wait time,
 * staff can check for any patient in their clinic.
 * 
 * Note: This uses rule-based estimation. ML estimation can be added when
 * the ML backend service is deployed.
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getQueueService, getBookingService } from "../../services/index.js";
import { logger } from "../../utils/logger.js";
import { 
  ValidationError, 
  NotFoundError, 
  AuthorizationError,
} from "../../utils/errors.js";
import type { AuthContext } from "../../middleware/auth/types.js";

// ============================================
// INPUT SCHEMA
// ============================================

const MlEstimateWaitTimeInputSchema = z.object({
  appointmentId: z
    .string()
    .uuid("Invalid appointment ID format")
    .describe("UUID of the appointment to estimate wait time for"),
});

type MlEstimateWaitTimeInput = z.infer<typeof MlEstimateWaitTimeInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const mlEstimateWaitTimeTool: Tool = {
  name: "ml_estimateWaitTime",
  description: `Estimate wait time for a patient's appointment.

**Requires authentication** - users must be logged in.

Use this tool when users want to:
- Get an estimated wait time before their consultation
- Know how long they'll be waiting
- Plan their time at the clinic

Parameters:
- appointmentId: UUID of the appointment (required)

Returns:
- waitTimeMinutes: Estimated wait time in minutes
- confidence: Confidence level (0-1)
- mode: Estimation method used
- explanation: Factors affecting the estimate
- queueInfo: Current queue position and status

Access control:
- Patients can check wait time for their own appointments
- Staff can check wait time for appointments at their clinic`,
  inputSchema: {
    type: "object",
    properties: {
      appointmentId: {
        type: "string",
        description: "Appointment UUID",
      },
    },
    required: ["appointmentId"],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface WaitTimeEstimationResult {
  success: boolean;
  appointmentId: string;
  estimation: {
    waitTimeMinutes: number;
    confidence: number;
    mode: "rule-based" | "historical-average" | "ml";
    explanation: {
      topFactors: string[];
      context: string;
    };
  };
  queueInfo: {
    position: number | null;
    patientsAhead: number;
    status: string;
    clinicId: string;
    appointmentDate: string;
  };
}

// ============================================
// ESTIMATION LOGIC
// ============================================

/**
 * Rule-based wait time estimation
 * 
 * Factors considered:
 * 1. Queue position (main factor)
 * 2. Average consultation duration (default: 15 min)
 * 3. Time of day adjustments
 * 4. Appointment type adjustments
 */
function calculateRuleBasedEstimate(params: {
  queuePosition: number | null;
  patientsAhead: number;
  averageDuration: number;
  appointmentType: string;
  scheduledTime?: string;
  status: string;
}): { waitTimeMinutes: number; confidence: number; factors: string[] } {
  const factors: string[] = [];
  
  // If already being served
  if (params.status === "in_progress") {
    return {
      waitTimeMinutes: 0,
      confidence: 1.0,
      factors: ["Currently being served"],
    };
  }
  
  // If completed or cancelled
  if (["completed", "cancelled", "no_show"].includes(params.status)) {
    return {
      waitTimeMinutes: 0,
      confidence: 1.0,
      factors: [`Appointment status: ${params.status}`],
    };
  }
  
  // Base estimate: patients ahead * average duration
  let baseEstimate = params.patientsAhead * params.averageDuration;
  factors.push(`${params.patientsAhead} patients ahead × ${params.averageDuration}min avg`);
  
  // Appointment type adjustment
  const typeMultipliers: Record<string, number> = {
    "consultation": 1.0,
    "follow_up": 0.7,
    "checkup": 1.0,
    "procedure": 1.5,
    "vaccination": 0.5,
  };
  
  const typeMultiplier = typeMultipliers[params.appointmentType.toLowerCase()] || 1.0;
  if (typeMultiplier !== 1.0) {
    baseEstimate *= typeMultiplier;
    factors.push(`${params.appointmentType} type adjustment (×${typeMultiplier})`);
  }
  
  // Time of day adjustment (busier mid-morning)
  if (params.scheduledTime) {
    const hour = parseInt(params.scheduledTime.split(":")[0], 10);
    if (hour >= 10 && hour <= 12) {
      baseEstimate *= 1.2;
      factors.push("Peak hours adjustment (+20%)");
    } else if (hour >= 14 && hour <= 15) {
      baseEstimate *= 0.9;
      factors.push("Post-lunch lull adjustment (-10%)");
    }
  }
  
  // Round to nearest 5 minutes
  const waitTimeMinutes = Math.max(0, Math.round(baseEstimate / 5) * 5);
  
  // Confidence based on patients ahead (more patients = less confident)
  const confidence = Math.max(0.4, 1 - (params.patientsAhead * 0.05));
  
  return {
    waitTimeMinutes,
    confidence: Math.round(confidence * 100) / 100,
    factors,
  };
}

// ============================================
// EXECUTOR
// ============================================

export async function executeMlEstimateWaitTime(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<WaitTimeEstimationResult> {
  // Require authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to estimate wait time. Please log in."
    );
  }

  // Validate input
  let params: MlEstimateWaitTimeInput;
  try {
    params = MlEstimateWaitTimeInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  logger.info("Estimating wait time via rule-based calculation", {
    appointmentId: params.appointmentId,
    userId: context.userId,
    role: context.role,
  });

  // Get services from @queuemed/core
  const queueService = getQueueService();
  const bookingService = getBookingService();

  // Fetch appointment
  let appointment;
  try {
    appointment = await queueService.getQueueEntry(params.appointmentId);
  } catch (error) {
    throw new NotFoundError("Appointment", params.appointmentId);
  }

  // Authorization check
  if (context.role === "patient") {
    if (appointment.patientId !== context.patientId && appointment.patientId !== context.userId) {
      throw new AuthorizationError(
        "You can only check wait time for your own appointments."
      );
    }
  }
  
  if (context.role === "staff" || context.role === "clinic_owner") {
    if (appointment.clinicId !== context.clinicId) {
      throw new AuthorizationError(
        "You can only check wait time for appointments at your clinic."
      );
    }
  }

  // Get queue entries to count patients ahead
  const queueEntries = await queueService.getQueueEntries(
    appointment.clinicId,
    appointment.appointmentDate
  );
  
  // Count patients ahead (waiting or checked in, with lower queue position)
  const patientsAhead = queueEntries.filter((e: { status: string; queuePosition?: number }) => 
    (e.status === "scheduled" || e.status === "checked_in") &&
    e.queuePosition !== undefined &&
    appointment.queuePosition !== undefined &&
    e.queuePosition < appointment.queuePosition
  ).length;

  // Get average duration from clinic info
  const { appointmentTypes } = await bookingService.getClinicInfo(appointment.clinicId);
  const matchingType = appointmentTypes.find(
    (t: { name: string }) => t.name.toLowerCase() === appointment.appointmentType.toLowerCase()
  );
  const averageDuration = matchingType?.duration || 15;

  // Calculate estimate
  const estimate = calculateRuleBasedEstimate({
    queuePosition: appointment.queuePosition || null,
    patientsAhead,
    averageDuration,
    appointmentType: appointment.appointmentType,
    scheduledTime: appointment.scheduledTime,
    status: appointment.status,
  });

  logger.info("Wait time estimated", {
    appointmentId: params.appointmentId,
    waitTimeMinutes: estimate.waitTimeMinutes,
    confidence: estimate.confidence,
    patientsAhead,
  });

  return {
    success: true,
    appointmentId: params.appointmentId,
    estimation: {
      waitTimeMinutes: estimate.waitTimeMinutes,
      confidence: estimate.confidence,
      mode: "rule-based",
      explanation: {
        topFactors: estimate.factors,
        context: patientsAhead === 0
          ? "You are next in line or currently being served."
          : `Based on ${patientsAhead} patient(s) ahead with an average consultation time of ${averageDuration} minutes.`,
      },
    },
    queueInfo: {
      position: appointment.queuePosition || null,
      patientsAhead,
      status: appointment.status,
      clinicId: appointment.clinicId,
      appointmentDate: appointment.appointmentDate,
    },
  };
}

