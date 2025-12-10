/**
 * QueueMed MCP Server - Entry Point
 * 
 * This is the main entry point for the MCP (Model Context Protocol) server.
 * It exposes healthcare tools and resources to AI assistants.
 * 
 * @author QueueMed Team
 * @version 1.0.0
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPServer } from "./server.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting QueueMed MCP Server", {
    version: "1.0.0",
    environment: config.nodeEnv,
  });

  try {
    // Create the MCP server
    const server = createMCPServer();

    // Create stdio transport (for MCP protocol communication)
    const transport = new StdioServerTransport();

    // Connect the server to the transport
    await server.connect(transport);

    logger.info("QueueMed MCP Server running on stdio transport");

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down...");
      await server.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down...");
      await server.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error("Failed to start MCP server", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

