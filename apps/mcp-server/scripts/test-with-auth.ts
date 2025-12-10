/**
 * Test Script with Authentication
 * 
 * This script allows testing authenticated tools with either:
 * 1. Mock contexts (no database needed)
 * 2. Real tokens (requires Supabase credentials)
 * 
 * Usage:
 *   npm run test:auth              # Run with mock contexts
 *   npm run test:auth -- --real    # Run with real Supabase (needs .env)
 */

import { executeToolCall } from "../src/tools/index.js";
import type { AuthContext } from "../src/middleware/auth/index.js";
import { getPermissionsForRole, ANONYMOUS_CONTEXT } from "../src/middleware/auth/index.js";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string): void {
  console.log("\n" + "=".repeat(60));
  log(` ${title}`, colors.bold + colors.cyan);
  console.log("=".repeat(60));
}

function logSuccess(message: string): void {
  log(`✅ ${message}`, colors.green);
}

function logError(message: string): void {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message: string): void {
  log(`ℹ️  ${message}`, colors.yellow);
}

// ============================================
// MOCK AUTH CONTEXTS
// ============================================

/**
 * Create a mock patient context
 */
function createPatientContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "test-patient-user-id",
    role: "patient",
    patientId: "test-patient-id",
    phoneNumber: "+212600000001",
    fullName: "Test Patient",
    permissions: getPermissionsForRole("patient"),
    isAuthenticated: true,
    ...overrides,
  };
}

/**
 * Create a mock staff context
 */
function createStaffContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "test-staff-user-id",
    role: "staff",
    clinicId: "test-clinic-id",
    staffId: "test-staff-id",
    phoneNumber: "+212600000002",
    fullName: "Test Staff",
    permissions: getPermissionsForRole("staff"),
    isAuthenticated: true,
    ...overrides,
  };
}

/**
 * Create a mock clinic owner context
 */
function createOwnerContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "test-owner-user-id",
    role: "clinic_owner",
    clinicId: "test-clinic-id",
    staffId: "test-owner-staff-id",
    phoneNumber: "+212600000003",
    fullName: "Test Owner",
    permissions: getPermissionsForRole("clinic_owner"),
    isAuthenticated: true,
    ...overrides,
  };
}

// ============================================
// TEST CASES
// ============================================

async function testBookingCreateWithAuth(): Promise<boolean> {
  logSection("Testing booking_create with Authentication");
  
  let allPassed = true;
  
  // Test 1: Anonymous should be denied
  logInfo("Test 1: Anonymous user tries to book...");
  const anonResult = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    appointmentDate: "2025-01-20",
    appointmentType: "consultation",
  }, ANONYMOUS_CONTEXT);
  
  if (anonResult.isError && anonResult.content[0]?.text?.includes("Authentication required")) {
    logSuccess("Anonymous correctly denied");
  } else {
    logError("Anonymous should be denied");
    allPassed = false;
  }
  
  // Test 2: Patient can attempt to book (will fail at DB level but pass auth)
  logInfo("Test 2: Authenticated patient tries to book...");
  const patientContext = createPatientContext();
  const patientResult = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    appointmentDate: "2025-01-20",
    appointmentType: "consultation",
  }, patientContext);
  
  const patientText = patientResult.content[0]?.text || "";
  // Should pass auth but fail at database (no real clinic)
  if (!patientText.includes("Authentication required")) {
    logSuccess("Patient passed authentication check");
    log(`   Result: ${patientText.substring(0, 100)}...`, colors.yellow);
  } else {
    logError("Patient should pass authentication");
    allPassed = false;
  }
  
  // Test 3: Staff can book for any patient
  logInfo("Test 3: Staff tries to book for a patient...");
  const staffContext = createStaffContext();
  const staffResult = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    patientId: "some-other-patient-id",
    appointmentDate: "2025-01-20",
    appointmentType: "consultation",
  }, staffContext);
  
  const staffText = staffResult.content[0]?.text || "";
  if (!staffText.includes("Authentication required") && !staffText.includes("only book appointments for themselves")) {
    logSuccess("Staff passed authentication and authorization");
    log(`   Result: ${staffText.substring(0, 100)}...`, colors.yellow);
  } else {
    logError("Staff should be able to book for patients");
    allPassed = false;
  }
  
  return allPassed;
}

async function testBookingCancelWithAuth(): Promise<boolean> {
  logSection("Testing booking_cancel with Authentication");
  
  let allPassed = true;
  
  // Test 1: Anonymous denied
  logInfo("Test 1: Anonymous tries to cancel...");
  const anonResult = await executeToolCall("booking_cancel", {
    appointmentId: "123e4567-e89b-12d3-a456-426614174000",
  }, ANONYMOUS_CONTEXT);
  
  if (anonResult.isError && anonResult.content[0]?.text?.includes("Authentication required")) {
    logSuccess("Anonymous correctly denied");
  } else {
    logError("Anonymous should be denied");
    allPassed = false;
  }
  
  // Test 2: Patient can attempt cancel (will fail at DB)
  logInfo("Test 2: Authenticated patient tries to cancel...");
  const patientContext = createPatientContext();
  const patientResult = await executeToolCall("booking_cancel", {
    appointmentId: "123e4567-e89b-12d3-a456-426614174000",
  }, patientContext);
  
  const patientText = patientResult.content[0]?.text || "";
  if (!patientText.includes("Authentication required")) {
    logSuccess("Patient passed authentication check");
    log(`   Result: ${patientText.substring(0, 100)}...`, colors.yellow);
  } else {
    logError("Patient should pass authentication");
    allPassed = false;
  }
  
  return allPassed;
}

async function testInputValidation(): Promise<boolean> {
  logSection("Testing Input Validation (with auth)");
  
  let allPassed = true;
  const patientContext = createPatientContext();
  
  // Test: Invalid date format
  logInfo("Testing booking_create with invalid date...");
  const result = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    appointmentDate: "invalid-date",
  }, patientContext);
  
  const text = result.content[0]?.text || "";
  if (text.includes("YYYY-MM-DD") || text.includes("Invalid")) {
    logSuccess("Invalid date correctly rejected");
  } else {
    logError("Should reject invalid date");
    allPassed = false;
  }
  
  // Test: Past date
  logInfo("Testing booking_create with past date...");
  const pastResult = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    appointmentDate: "2020-01-01",
  }, patientContext);
  
  const pastText = pastResult.content[0]?.text || "";
  if (pastText.includes("past") || pastText.includes("Invalid")) {
    logSuccess("Past date correctly rejected");
  } else {
    logError("Should reject past date");
    allPassed = false;
  }
  
  return allPassed;
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  console.log("\n");
  log("🔐 QueueMed MCP Server - Authentication Test Suite", colors.bold + colors.cyan);
  log("================================================\n", colors.cyan);
  
  log("Testing with MOCK auth contexts (no Supabase needed)", colors.yellow);
  log("These tests verify auth logic works correctly.\n", colors.yellow);
  
  const results: Record<string, boolean> = {};
  
  results["booking_create Auth"] = await testBookingCreateWithAuth();
  results["booking_cancel Auth"] = await testBookingCancelWithAuth();
  results["Input Validation"] = await testInputValidation();
  
  // Summary
  logSection("Test Summary");
  
  let allPassed = true;
  for (const [test, passed] of Object.entries(results)) {
    if (passed) {
      logSuccess(`${test}: PASSED`);
    } else {
      logError(`${test}: FAILED`);
      allPassed = false;
    }
  }
  
  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    log("🎉 ALL AUTH TESTS PASSED!", colors.bold + colors.green);
  } else {
    log("⚠️  SOME TESTS FAILED", colors.bold + colors.red);
  }
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);

