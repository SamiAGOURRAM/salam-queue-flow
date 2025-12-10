/**
 * MCP Server Configuration
 * 
 * Creates and configures the MCP server with tools and resources.
 * This is the heart of the QueueMed AI assistant capabilities.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { registerTools, executeToolCall } from "./tools/index.js";
import { registerResources, getResource } from "./resources/index.js";
import { logger } from "./utils/logger.js";

/**
 * Creates the MCP server with all tools and resources registered.
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: "queuemed-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // ============================================
  // TOOL HANDLERS
  // ============================================

  /**
   * List all available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug("Listing tools");
    const tools = registerTools();
    logger.info("Tools listed", { count: tools.length });
    return { tools };
  });

  /**
   * Execute a tool call
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    logger.info("Tool call received", { 
      tool: name, 
      hasArgs: !!args,
    });

    try {
      const result = await executeToolCall(name, args || {});
      logger.info("Tool call completed", { tool: name, success: true });
      return result;
    } catch (error) {
      logger.error("Tool call failed", {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  // ============================================
  // RESOURCE HANDLERS
  // ============================================

  /**
   * List all available resources
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.debug("Listing resources");
    const resources = registerResources();
    logger.info("Resources listed", { count: resources.length });
    return { resources };
  });

  /**
   * Read a specific resource
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    logger.info("Resource read requested", { uri });

    try {
      const result = getResource(uri);
      logger.info("Resource read completed", { uri });
      return result;
    } catch (error) {
      logger.error("Resource read failed", {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  server.onerror = (error) => {
    logger.error("MCP Server error", {
      error: error instanceof Error ? error.message : String(error),
    });
  };

  return server;
}

