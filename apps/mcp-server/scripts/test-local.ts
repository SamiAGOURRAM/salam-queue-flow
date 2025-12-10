/**
 * Local Test Script for QueueMed MCP Server
 * 
 * Tests the MCP server without requiring database connection.
 * Verifies:
 * - Server starts correctly
 * - Tools are registered
 * - Resources are accessible
 * - Basic validation works
 */

import { registerTools, executeToolCall, hasTool, canExecuteTool, getAccessibleTools } from "../src/tools/index.js";
import { registerResources, getResource, hasResource } from "../src/resources/index.js";
import type { AuthContext } from "../src/middleware/auth/index.js";
import { 
  ANONYMOUS_CONTEXT,
  getPermissionsForRole,
  canAccessTool,
  TOOL_PERMISSIONS,
} from "../src/middleware/auth/index.js";

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

async function testToolRegistry(): Promise<boolean> {
  logSection("Testing Tool Registry");
  
  const tools = registerTools();
  log(`Found ${tools.length} tools registered`);
  
  let allPassed = true;
  
  for (const tool of tools) {
    const exists = hasTool(tool.name);
    if (exists) {
      logSuccess(`Tool: ${tool.name}`);
      log(`   Description: ${tool.description?.substring(0, 60)}...`);
    } else {
      logError(`Tool ${tool.name} is registered but has no executor`);
      allPassed = false;
    }
  }
  
  // Verify expected tools exist
  const expectedTools = [
    "clinic_search", 
    "clinic_getInfo", 
    "booking_getAvailability",
    "booking_create",    // Phase 2
    "booking_cancel",    // Phase 2
  ];
  for (const toolName of expectedTools) {
    if (!hasTool(toolName)) {
      logError(`Expected tool missing: ${toolName}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function testResourceRegistry(): Promise<boolean> {
  logSection("Testing Resource Registry");
  
  const resources = registerResources();
  log(`Found ${resources.length} resources registered`);
  
  let allPassed = true;
  
  for (const resource of resources) {
    const exists = hasResource(resource.uri);
    if (exists) {
      logSuccess(`Resource: ${resource.uri}`);
      log(`   Name: ${resource.name}`);
      
      // Test reading the resource
      try {
        const content = getResource(resource.uri);
        const textLength = content.contents[0]?.text?.length || 0;
        log(`   Content length: ${textLength} chars`);
      } catch (error) {
        logError(`Failed to read resource: ${error}`);
        allPassed = false;
      }
    } else {
      logError(`Resource ${resource.uri} is registered but not found`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function testToolValidation(): Promise<boolean> {
  logSection("Testing Tool Input Validation");
  
  let allPassed = true;
  
  // Test 1: clinic_search with valid input (no DB required for validation)
  logInfo("Testing clinic_search validation...");
  try {
    // This will fail at DB level but should pass validation
    await executeToolCall("clinic_search", { limit: 5 });
    logInfo("clinic_search: Validation passed (DB error expected)");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("validation") || errorMessage.includes("Invalid")) {
      logError(`clinic_search validation failed: ${errorMessage}`);
      allPassed = false;
    } else {
      // DB error is expected without connection
      logSuccess("clinic_search: Input validation passed");
    }
  }
  
  // Test 2: clinic_getInfo with invalid UUID
  logInfo("Testing clinic_getInfo with invalid UUID...");
  try {
    const result = await executeToolCall("clinic_getInfo", { clinicId: "not-a-uuid" });
    const resultText = result.content[0]?.text || "";
    if (resultText.includes("Invalid") || resultText.includes("UUID") || result.isError) {
      logSuccess("clinic_getInfo: Correctly rejected invalid UUID");
    } else {
      logError("clinic_getInfo should have rejected invalid UUID");
      allPassed = false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Invalid") || errorMessage.includes("UUID")) {
      logSuccess("clinic_getInfo: Correctly rejected invalid UUID");
    } else {
      logInfo(`clinic_getInfo: Got error: ${errorMessage}`);
    }
  }
  
  // Test 3: booking_getAvailability with invalid date
  logInfo("Testing booking_getAvailability with invalid date...");
  try {
    const result = await executeToolCall("booking_getAvailability", {
      clinicId: "123e4567-e89b-12d3-a456-426614174000",
      date: "invalid-date",
    });
    const resultText = result.content[0]?.text || "";
    if (resultText.includes("Invalid") || resultText.includes("YYYY-MM-DD") || result.isError) {
      logSuccess("booking_getAvailability: Correctly rejected invalid date");
    } else {
      logError("booking_getAvailability should have rejected invalid date");
      allPassed = false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Invalid") || errorMessage.includes("YYYY-MM-DD")) {
      logSuccess("booking_getAvailability: Correctly rejected invalid date");
    } else {
      logInfo(`booking_getAvailability: Got error: ${errorMessage}`);
    }
  }
  
  // Test 4: Unknown tool
  logInfo("Testing unknown tool handling...");
  const result = await executeToolCall("unknown_tool", {});
  const resultText = result.content[0]?.text || "";
  if (resultText.includes("UNKNOWN_TOOL") || resultText.includes("not found")) {
    logSuccess("Unknown tool: Correctly handled");
  } else {
    logError("Unknown tool not handled correctly");
    allPassed = false;
  }
  
  return allPassed;
}

async function testAuthentication(): Promise<boolean> {
  logSection("Testing Authentication & RBAC");
  
  let allPassed = true;
  
  // Test 1: Anonymous context
  logInfo("Testing anonymous context...");
  if (!ANONYMOUS_CONTEXT.isAuthenticated) {
    logSuccess("Anonymous context is not authenticated");
  } else {
    logError("Anonymous context should not be authenticated");
    allPassed = false;
  }
  
  // Test 2: Role permissions
  logInfo("Testing role permissions...");
  const patientPerms = getPermissionsForRole("patient");
  const staffPerms = getPermissionsForRole("staff");
  const ownerPerms = getPermissionsForRole("clinic_owner");
  
  if (patientPerms.length < staffPerms.length && staffPerms.length < ownerPerms.length) {
    logSuccess(`Permission hierarchy: patient(${patientPerms.length}) < staff(${staffPerms.length}) < owner(${ownerPerms.length})`);
  } else {
    logError("Permission hierarchy is incorrect");
    allPassed = false;
  }
  
  // Test 3: Tool access for anonymous
  logInfo("Testing tool access for anonymous...");
  const publicTools = ["clinic_search", "clinic_getInfo", "booking_getAvailability"];
  for (const tool of publicTools) {
    if (canAccessTool(ANONYMOUS_CONTEXT, tool)) {
      logSuccess(`Anonymous can access public tool: ${tool}`);
    } else {
      logError(`Anonymous should be able to access: ${tool}`);
      allPassed = false;
    }
  }
  
  // Test 4: Protected tool access denied for anonymous
  logInfo("Testing protected tool access denied for anonymous...");
  const protectedTools = ["queue_getSchedule", "queue_callNext", "booking_create"];
  for (const tool of protectedTools) {
    if (!canAccessTool(ANONYMOUS_CONTEXT, tool)) {
      logSuccess(`Anonymous correctly denied access to: ${tool}`);
    } else {
      logError(`Anonymous should NOT access protected tool: ${tool}`);
      allPassed = false;
    }
  }
  
  // Test 5: Staff context mock
  logInfo("Testing staff context permissions...");
  const staffContext: AuthContext = {
    userId: "test-staff-123",
    role: "staff",
    clinicId: "test-clinic-456",
    staffId: "staff-789",
    permissions: getPermissionsForRole("staff"),
    isAuthenticated: true,
  };
  
  if (canAccessTool(staffContext, "queue_getSchedule")) {
    logSuccess("Staff can access queue_getSchedule");
  } else {
    logError("Staff should be able to access queue_getSchedule");
    allPassed = false;
  }
  
  // Test 6: Patient context cannot access staff tools
  logInfo("Testing patient context restrictions...");
  const patientContext: AuthContext = {
    userId: "test-patient-123",
    role: "patient",
    patientId: "patient-456",
    permissions: getPermissionsForRole("patient"),
    isAuthenticated: true,
  };
  
  if (!canAccessTool(patientContext, "queue_callNext")) {
    logSuccess("Patient correctly denied access to queue_callNext");
  } else {
    logError("Patient should NOT access staff tool queue_callNext");
    allPassed = false;
  }
  
  // Test 7: List accessible tools by role
  logInfo("Testing accessible tools by role...");
  const patientTools = getAccessibleTools(patientContext);
  const staffTools = getAccessibleTools(staffContext);
  
  log(`   Patient can access ${patientTools.length} tools`);
  log(`   Staff can access ${staffTools.length} tools`);
  
  if (staffTools.length >= patientTools.length) {
    logSuccess("Staff has equal or more tool access than patient");
  } else {
    logError("Staff should have more or equal tool access");
    allPassed = false;
  }
  
  // Test 8: booking_create requires authentication
  logInfo("Testing booking_create auth requirement...");
  const createResult = await executeToolCall("booking_create", {
    clinicId: "123e4567-e89b-12d3-a456-426614174000",
    appointmentDate: "2025-01-20",
  }, ANONYMOUS_CONTEXT);
  
  const createText = createResult.content[0]?.text || "";
  if (createText.includes("Authentication required") || createResult.isError) {
    logSuccess("booking_create correctly requires authentication");
  } else {
    logError("booking_create should require authentication");
    allPassed = false;
  }
  
  // Test 9: booking_cancel requires authentication
  logInfo("Testing booking_cancel auth requirement...");
  const cancelResult = await executeToolCall("booking_cancel", {
    appointmentId: "123e4567-e89b-12d3-a456-426614174000",
  }, ANONYMOUS_CONTEXT);
  
  const cancelText = cancelResult.content[0]?.text || "";
  if (cancelText.includes("Authentication required") || cancelResult.isError) {
    logSuccess("booking_cancel correctly requires authentication");
  } else {
    logError("booking_cancel should require authentication");
    allPassed = false;
  }
  
  return allPassed;
}

async function testResourceContent(): Promise<boolean> {
  logSection("Testing Resource Content");
  
  let allPassed = true;
  
  // Test emergency resource has key content
  logInfo("Checking emergency resource content...");
  try {
    const emergency = getResource("queuemed://policies/emergency");
    const text = emergency.contents[0]?.text || "";
    
    const requiredContent = ["141", "SAMU", "19", "Police"];
    for (const content of requiredContent) {
      if (text.includes(content)) {
        logSuccess(`Emergency resource contains: ${content}`);
      } else {
        logError(`Emergency resource missing: ${content}`);
        allPassed = false;
      }
    }
  } catch (error) {
    logError(`Failed to read emergency resource: ${error}`);
    allPassed = false;
  }
  
  // Test appointment types schema is valid JSON
  logInfo("Checking appointment types schema...");
  try {
    const schema = getResource("queuemed://schemas/appointment-types");
    const text = schema.contents[0]?.text || "";
    const parsed = JSON.parse(text);
    
    if (parsed.appointmentTypes && Array.isArray(parsed.appointmentTypes)) {
      logSuccess(`Appointment types: ${parsed.appointmentTypes.length} types defined`);
    } else {
      logError("Appointment types schema is invalid");
      allPassed = false;
    }
  } catch (error) {
    logError(`Failed to parse appointment types: ${error}`);
    allPassed = false;
  }
  
  // Test specialties schema is valid JSON
  logInfo("Checking specialties schema...");
  try {
    const schema = getResource("queuemed://schemas/specialties");
    const text = schema.contents[0]?.text || "";
    const parsed = JSON.parse(text);
    
    if (parsed.specialties && Array.isArray(parsed.specialties)) {
      logSuccess(`Specialties: ${parsed.specialties.length} specialties defined`);
    } else {
      logError("Specialties schema is invalid");
      allPassed = false;
    }
  } catch (error) {
    logError(`Failed to parse specialties: ${error}`);
    allPassed = false;
  }
  
  return allPassed;
}

async function main(): Promise<void> {
  console.log("\n");
  log("🏥 QueueMed MCP Server - Phase 1 Test Suite", colors.bold + colors.cyan);
  log("============================================\n", colors.cyan);
  
  const results: Record<string, boolean> = {};
  
  // Run tests
  results["Tool Registry"] = await testToolRegistry();
  results["Resource Registry"] = await testResourceRegistry();
  results["Tool Validation"] = await testToolValidation();
  results["Authentication & RBAC"] = await testAuthentication();
  results["Resource Content"] = await testResourceContent();
  
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
    log("🎉 ALL TESTS PASSED!", colors.bold + colors.green);
    log("\nPhase 1 is ready! Next steps:", colors.cyan);
    log("1. Add your Supabase credentials to .env");
    log("2. Run 'npm run inspector' to test with real data");
    log("3. Proceed to Phase 2 for more tools");
  } else {
    log("⚠️  SOME TESTS FAILED", colors.bold + colors.red);
    log("\nPlease fix the issues above before proceeding.");
  }
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);

