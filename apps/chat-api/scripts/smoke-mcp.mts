/**
 * Smoke test for the MCP HTTP transport + auth-scoped tool listing.
 * Usage: tsx scripts/smoke-mcp.mts [mcpUrl] [bearerToken]
 */
import { createMcpSession } from "../src/mcp.js";

const mcpUrl = process.argv[2] ?? "http://localhost:3001/mcp";
const token = process.argv[3];

const session = await createMcpSession(mcpUrl, token);
const toolNames = Object.keys(session.tools);
console.log(`Connected (${token ? "authenticated" : "anonymous"}). Tools visible: ${toolNames.length}`);
console.log(toolNames.join(", "));

// Try a public tool to prove the call path.
if (session.tools["clinic_search"]) {
  console.log("\nCalling clinic_search { query: 'clinic' } ...");
  try {
    const out = await (session.tools["clinic_search"] as { execute: (a: unknown, o: unknown) => Promise<unknown> })
      .execute({ query: "clinic", limit: 2 }, {});
    console.log("Result:", typeof out === "string" ? out.slice(0, 400) : out);
  } catch (e) {
    console.log("clinic_search error:", e instanceof Error ? e.message : e);
  }
}

await session.close();
process.exit(0);
