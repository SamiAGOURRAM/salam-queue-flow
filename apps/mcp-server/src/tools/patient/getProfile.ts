/**
 * Patient Get Profile Tool
 * 
 * Gets a patient's profile information.
 * 
 * **Requires authentication** - patients can only view their own profile,
 * staff can view profiles of patients in their clinic.
 */

import { z } from "zod";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getPatientService } from "../../services/index.js";
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

const PatientGetProfileInputSchema = z.object({
  patientId: z
    .string()
    .uuid("Invalid patient ID format")
    .optional()
    .describe("Patient UUID (optional - defaults to authenticated user)"),
});

type PatientGetProfileInput = z.infer<typeof PatientGetProfileInputSchema>;

// ============================================
// TOOL DEFINITION
// ============================================

export const patientGetProfileTool: Tool = {
  name: "patient_getProfile",
  description: `Get a patient's profile information.

**Requires authentication** - users must be logged in.

Use this tool when users want to:
- View their profile information
- Check their contact details
- Verify their patient record

Parameters:
- patientId: Patient UUID (optional - defaults to logged-in user)

Returns:
- Patient profile with name, phone, email, etc.

Access control:
- Patients can only view their own profile
- Staff can view profiles of patients with appointments at their clinic`,
  inputSchema: {
    type: "object",
    properties: {
      patientId: {
        type: "string",
        description: "Patient UUID (optional)",
      },
    },
    required: [],
  },
};

// ============================================
// OUTPUT TYPE
// ============================================

interface PatientProfileResult {
  success: boolean;
  patient: {
    id: string;
    fullName: string;
    phoneNumber?: string;
    email?: string;
    dateOfBirth?: string;
    gender?: string;
    createdAt: string;
  };
}

// ============================================
// EXECUTOR
// Uses @queuemed/core PatientService
// ============================================

export async function executePatientGetProfile(
  args: Record<string, unknown>,
  context: AuthContext
): Promise<PatientProfileResult> {
  // Require authentication
  if (!context.isAuthenticated) {
    throw new AuthorizationError(
      "Authentication required to view patient profile. Please log in."
    );
  }

  // Validate input
  let params: PatientGetProfileInput;
  try {
    params = PatientGetProfileInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    throw error;
  }

  // Determine patient ID
  let patientId = params.patientId;
  
  if (!patientId) {
    if (context.patientId) {
      patientId = context.patientId;
    } else if (context.userId) {
      patientId = context.userId;
    } else {
      throw new ValidationError(
        "Patient ID is required. Either provide patientId or authenticate as a patient."
      );
    }
  }

  // Authorization check
  // Patients can only view their own profile
  if (context.role === "patient") {
    if (patientId !== context.patientId && patientId !== context.userId) {
      throw new AuthorizationError(
        "You can only view your own profile."
      );
    }
  }

  logger.info("Getting patient profile via @queuemed/core", {
    patientId,
    userId: context.userId,
    role: context.role,
  });

  // Get patient service from @queuemed/core
  const patientService = getPatientService();

  // Fetch patient profile
  let patient;
  try {
    patient = await patientService.getPatient(patientId);
  } catch (error) {
    throw new NotFoundError("Patient", patientId);
  }

  logger.info("Patient profile retrieved via @queuemed/core", {
    patientId,
  });

  return {
    success: true,
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      phoneNumber: patient.phoneNumber,
      email: patient.email,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      createdAt: patient.createdAt,
    },
  };
}

