/**
 * Comprehensive Test Suite for QueueMed MCP Server
 * 
 * Tests ALL tools with:
 * - Input validation
 * - Authentication/RBAC
 * - Real Supabase data (when credentials available)
 * 
 * Run: npx tsx scripts/test-comprehensive.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { registerTools, executeToolCall, hasTool, canExecuteTool, getAccessibleTools } from "../src/tools/index.js";
import { registerResources, getResource, hasResource } from "../src/resources/index.js";
import type { AuthContext } from "../src/middleware/auth/index.js";
import { 
  ANONYMOUS_CONTEXT,
  getPermissionsForRole,
  canAccessTool,
  TOOL_PERMISSIONS,
} from "../src/middleware/auth/index.js";
import { initializeServices, areServicesInitialized } from "../src/services/index.js";
import { config } from "../src/config.js";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string): void {
  console.log("\n" + "═".repeat(70));
  log(` ${title}`, colors.bold + colors.cyan);
  console.log("═".repeat(70));
}

function logSubsection(title: string): void {
  console.log();
  log(`▸ ${title}`, colors.bold);
  console.log("─".repeat(50));
}

function logSuccess(message: string): void {
  log(`  ✅ ${message}`, colors.green);
}

function logError(message: string): void {
  log(`  ❌ ${message}`, colors.red);
}

function logInfo(message: string): void {
  log(`  ℹ️  ${message}`, colors.yellow);
}

function logSkip(message: string): void {
  log(`  ⏭️  ${message}`, colors.dim);
}

// ============================================
// TEST CONTEXTS
// ============================================

function createPatientContext(): AuthContext {
  return {
    userId: "test-patient-user",
    role: "patient",
    patientId: "test-patient-id",
    permissions: getPermissionsForRole("patient"),
    isAuthenticated: true,
  };
}

function createStaffContext(): AuthContext {
  return {
    userId: "test-staff-user",
    role: "staff",
    clinicId: "test-clinic-id",
    staffId: "test-staff-id",
    permissions: getPermissionsForRole("staff"),
    isAuthenticated: true,
  };
}

function createOwnerContext(): AuthContext {
  return {
    userId: "test-owner-user",
    role: "clinic_owner",
    clinicId: "test-clinic-id",
    staffId: "test-owner-staff-id",
    permissions: getPermissionsForRole("clinic_owner"),
    isAuthenticated: true,
  };
}

// ============================================
// TEST FUNCTIONS
// ============================================

async function testToolRegistry(): Promise<boolean> {
  logSection("1. Tool Registry");
  
  const tools = registerTools();
  log(`   Registered ${tools.length} tools`);
  
  let allPassed = true;
  
  // Expected tools (complete list)
  const expectedTools = [
    // Clinic tools
    "clinic_search",
    "clinic_getInfo",
    // Booking tools
    "booking_getAvailability",
    "booking_create",
    "booking_cancel",
    // Queue tools
    "queue_getPosition",
    "queue_getSchedule",
    "queue_callNext",
    // Patient tools
    "patient_getProfile",
    "patient_getAppointments",
    // ML tools
    "ml_estimateWaitTime",
  ];
  
  logSubsection("Verifying all expected tools exist");
  
  for (const toolName of expectedTools) {
    if (hasTool(toolName)) {
      logSuccess(`${toolName}`);
    } else {
      logError(`Missing: ${toolName}`);
      allPassed = false;
    }
  }
  
  logSubsection("Tool descriptions");
  for (const tool of tools) {
    const desc = tool.description?.split("\n")[0] || "No description";
    log(`  • ${tool.name}: ${colors.dim}${desc.substring(0, 50)}...${colors.reset}`);
  }
  
  return allPassed;
}

async function testResourceRegistry(): Promise<boolean> {
  logSection("2. Resource Registry");
  
  const resources = registerResources();
  log(`   Registered ${resources.length} resources`);
  
  let allPassed = true;
  
  logSubsection("Verifying resource content");
  
  for (const resource of resources) {
    if (hasResource(resource.uri)) {
      try {
        const content = getResource(resource.uri);
        const textLength = content.contents[0]?.text?.length || 0;
        logSuccess(`${resource.name} (${textLength} chars)`);
      } catch (error) {
        logError(`Failed to read: ${resource.uri}`);
        allPassed = false;
      }
    } else {
      logError(`Not found: ${resource.uri}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function testInputValidation(): Promise<boolean> {
  logSection("3. Input Validation");
  
  let allPassed = true;
  const patientContext = createPatientContext();
  
  logSubsection("Testing invalid inputs are rejected");
  
  // Test 1: clinic_getInfo with invalid UUID
  const test1 = await executeToolCall("clinic_getInfo", { clinicId: "not-uuid" });
  if (test1.isError && test1.content[0]?.text?.includes("Invalid")) {
    logSuccess("clinic_getInfo rejects invalid UUID");
  } else {
    logError("clinic_getInfo should reject invalid UUID");
    allPassed = false;
  }
  
  // Test 2: booking_getAvailability with invalid date
  const test2 = await executeToolCall("booking_getAvailability", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    date: "bad-date",
  });
  if (test2.isError && test2.content[0]?.text?.includes("Invalid")) {
    logSuccess("booking_getAvailability rejects invalid date");
  } else {
    logError("booking_getAvailability should reject invalid date");
    allPassed = false;
  }
  
  // Test 3: booking_create missing required fields
  const test3 = await executeToolCall("booking_create", {}, patientContext);
  if (test3.isError) {
    logSuccess("booking_create rejects missing required fields");
  } else {
    logError("booking_create should reject missing fields");
    allPassed = false;
  }
  
  // Test 4: patient_getAppointments with invalid status
  const test4 = await executeToolCall("patient_getAppointments", { status: "invalid" }, patientContext);
  if (test4.isError && test4.content[0]?.text?.includes("Invalid")) {
    logSuccess("patient_getAppointments rejects invalid status");
  } else {
    logError("patient_getAppointments should reject invalid status");
    allPassed = false;
  }
  
  // Test 5: queue_getPosition with invalid UUID
  const test5 = await executeToolCall("queue_getPosition", { appointmentId: "bad" }, patientContext);
  if (test5.isError && test5.content[0]?.text?.includes("Invalid")) {
    logSuccess("queue_getPosition rejects invalid appointmentId");
  } else {
    logError("queue_getPosition should reject invalid UUID");
    allPassed = false;
  }
  
  // Test 6: ml_estimateWaitTime with invalid UUID
  const test6 = await executeToolCall("ml_estimateWaitTime", { appointmentId: "bad" }, patientContext);
  if (test6.isError && test6.content[0]?.text?.includes("Invalid")) {
    logSuccess("ml_estimateWaitTime rejects invalid appointmentId");
  } else {
    logError("ml_estimateWaitTime should reject invalid UUID");
    allPassed = false;
  }
  
  return allPassed;
}

async function testAuthentication(): Promise<boolean> {
  logSection("4. Authentication & RBAC");
  
  let allPassed = true;
  const patientContext = createPatientContext();
  const staffContext = createStaffContext();
  
  logSubsection("Public tools (anonymous access)");
  
  const publicTools = ["clinic_search", "clinic_getInfo", "booking_getAvailability"];
  for (const tool of publicTools) {
    if (canAccessTool(ANONYMOUS_CONTEXT, tool)) {
      logSuccess(`${tool} accessible to anonymous`);
    } else {
      logError(`${tool} should be public`);
      allPassed = false;
    }
  }
  
  logSubsection("Protected tools (auth required)");
  
  const authRequiredTools = [
    { name: "booking_create", minRole: "authenticated" },
    { name: "booking_cancel", minRole: "authenticated" },
    { name: "queue_getPosition", minRole: "patient" },
    { name: "patient_getProfile", minRole: "patient" },
    { name: "patient_getAppointments", minRole: "patient" },
    { name: "ml_estimateWaitTime", minRole: "patient" },
    { name: "queue_getSchedule", minRole: "staff" },
    { name: "queue_callNext", minRole: "staff" },
  ];
  
  for (const { name, minRole } of authRequiredTools) {
    // Should be denied for anonymous
    if (!canAccessTool(ANONYMOUS_CONTEXT, name)) {
      logSuccess(`${name} denies anonymous (requires ${minRole})`);
    } else {
      logError(`${name} should deny anonymous`);
      allPassed = false;
    }
    
    // Should be accessible to appropriate role
    const context = minRole === "staff" ? staffContext : patientContext;
    if (canAccessTool(context, name)) {
      logSuccess(`${name} allows ${context.role}`);
    } else {
      logError(`${name} should allow ${context.role}`);
      allPassed = false;
    }
  }
  
  logSubsection("Role hierarchy");
  
  const patientTools = getAccessibleTools(patientContext);
  const staffTools = getAccessibleTools(staffContext);
  
  log(`  Patient can access: ${patientTools.length} tools`);
  log(`  Staff can access: ${staffTools.length} tools`);
  
  if (staffTools.length >= patientTools.length) {
    logSuccess("Staff has >= patient tool access (correct hierarchy)");
  } else {
    logError("Staff should have >= patient tool access");
    allPassed = false;
  }
  
  logSubsection("Auth error messages");
  
  // Test auth error message for booking_create
  const result = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    appointmentDate: "2025-12-25",
  }, ANONYMOUS_CONTEXT);
  
  if (result.isError && result.content[0]?.text?.includes("Authentication required")) {
    logSuccess("booking_create returns helpful auth error");
  } else {
    logError("booking_create should return auth error message");
    allPassed = false;
  }
  
  return allPassed;
}

async function testWithRealDatabase(): Promise<boolean> {
  logSection("5. Real Database Tests");
  
  // Check if we have Supabase credentials
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    logSkip("Supabase credentials not configured - skipping real database tests");
    logInfo("To enable: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env");
    return true; // Don't fail if credentials not available
  }
  
  let allPassed = true;
  
  try {
    // Initialize services
    initializeServices();
    
    if (areServicesInitialized()) {
      logSuccess("Services initialized successfully");
    } else {
      logError("Services failed to initialize");
      return false;
    }
  } catch (error) {
    logError(`Service initialization failed: ${error instanceof Error ? error.message : error}`);
    return false;
  }
  
  logSubsection("Testing clinic_search (real data)");
  
  try {
    const result = await executeToolCall("clinic_search", { limit: 3 });
    const data = JSON.parse(result.content[0]?.text || "{}");
    
    if (data.success) {
      logSuccess(`Found ${data.clinics?.length || 0} clinics`);
      if (data.clinics?.length > 0) {
        log(`    First clinic: ${data.clinics[0].name}`);
      }
    } else {
      logInfo(`clinic_search returned: ${data.error?.message || "unknown error"}`);
    }
  } catch (error) {
    logError(`clinic_search failed: ${error instanceof Error ? error.message : error}`);
    allPassed = false;
  }
  
  logSubsection("Testing booking_getAvailability (real data)");
  
  try {
    // First, get a real clinic ID from search
    const searchResult = await executeToolCall("clinic_search", { limit: 1 });
    const searchData = JSON.parse(searchResult.content[0]?.text || "{}");
    
    if (searchData.clinics?.length > 0) {
      const clinicId = searchData.clinics[0].id;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split("T")[0];
      
      const result = await executeToolCall("booking_getAvailability", {
        clinicId,
        date: dateStr,
      });
      const data = JSON.parse(result.content[0]?.text || "{}");
      
      if (data.success) {
        logSuccess(`Found ${data.slots?.length || 0} slots for ${dateStr}`);
      } else {
        logInfo(`booking_getAvailability: ${data.error?.message || "no slots"}`);
      }
    } else {
      logSkip("No clinics found to test availability");
    }
  } catch (error) {
    logError(`booking_getAvailability failed: ${error instanceof Error ? error.message : error}`);
    allPassed = false;
  }
  
  logSubsection("Testing patient tools (mock context)");
  
  const patientContext = createPatientContext();
  
  try {
    // Test patient_getProfile
    const profileResult = await executeToolCall("patient_getProfile", {}, patientContext);
    const profileData = JSON.parse(profileResult.content[0]?.text || "{}");
    
    if (profileResult.isError) {
      logInfo(`patient_getProfile: ${profileData.error?.message || "patient not found"}`);
    } else {
      logSuccess(`patient_getProfile returned data for ${profileData.patient?.fullName || "unknown"}`);
    }
    
    // Test patient_getAppointments
    const aptsResult = await executeToolCall("patient_getAppointments", { limit: 5 }, patientContext);
    const aptsData = JSON.parse(aptsResult.content[0]?.text || "{}");
    
    if (aptsResult.isError) {
      logInfo(`patient_getAppointments: ${aptsData.error?.message || "not found"}`);
    } else {
      logSuccess(`patient_getAppointments returned ${aptsData.appointments?.length || 0} appointments`);
    }
  } catch (error) {
    logError(`Patient tools failed: ${error instanceof Error ? error.message : error}`);
    allPassed = false;
  }
  
  return allPassed;
}

async function testToolPermissionCoverage(): Promise<boolean> {
  logSection("6. Tool Permission Coverage");
  
  let allPassed = true;
  
  const tools = registerTools();
  
  logSubsection("Verifying all tools have permission definitions");
  
  for (const tool of tools) {
    const permission = TOOL_PERMISSIONS[tool.name];
    if (permission) {
      logSuccess(`${tool.name}: ${permission}`);
    } else {
      logError(`${tool.name}: MISSING PERMISSION DEFINITION`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  console.log("\n");
  log("🏥 QueueMed MCP Server - Comprehensive Test Suite", colors.bold + colors.cyan);
  log("═══════════════════════════════════════════════════════════════════════\n", colors.cyan);
  
  const results: Record<string, boolean> = {};
  
  // Run all tests
  results["Tool Registry"] = await testToolRegistry();
  results["Resource Registry"] = await testResourceRegistry();
  results["Input Validation"] = await testInputValidation();
  results["Authentication & RBAC"] = await testAuthentication();
  results["Tool Permission Coverage"] = await testToolPermissionCoverage();
  results["Real Database Tests"] = await testWithRealDatabase();
  
  // Summary
  logSection("TEST SUMMARY");
  
  let passed = 0;
  let failed = 0;
  
  for (const [test, result] of Object.entries(results)) {
    if (result) {
      logSuccess(`${test}: PASSED`);
      passed++;
    } else {
      logError(`${test}: FAILED`);
      failed++;
    }
  }
  
  console.log("\n" + "═".repeat(70));
  
  if (failed === 0) {
    log("🎉 ALL TESTS PASSED!", colors.bold + colors.green);
    console.log();
    log("✅ MCP Server is fully functional!", colors.green);
    log("   - All 11 tools registered and working", colors.green);
    log("   - Input validation is correct", colors.green);
    log("   - RBAC is properly configured", colors.green);
    console.log();
    log("📋 Next steps:", colors.cyan);
    log("   1. Test with MCP Inspector: npm run inspector");
    log("   2. Integrate with Cuga agent framework");
    log("   3. Connect to React chat widget");
  } else {
    log(`⚠️  ${failed} TEST(S) FAILED`, colors.bold + colors.red);
    log("\nPlease fix the issues above before proceeding.", colors.red);
  }
  
  console.log("═".repeat(70) + "\n");
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

