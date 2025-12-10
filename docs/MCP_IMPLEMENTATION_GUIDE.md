# 🚀 QueueMed MCP Implementation Guide

**Quick-Start Guide for Building the MCP Server**

---

## 📋 Prerequisites

Before starting, ensure you have:

- [ ] Node.js 20+ installed
- [ ] Access to Supabase project credentials
- [ ] API keys for LLM providers (Groq recommended for start)
- [ ] (Optional) Ollama installed for on-prem LLM testing
- [ ] (Optional) Tavily API key for web search

---

## Step 1: Initialize MCP Server Project

```bash
# From project root
mkdir mcp-server
cd mcp-server

# Initialize package.json
cat > package.json << 'EOF'
{
  "name": "queuemed-mcp-server",
  "version": "1.0.0",
  "description": "MCP Server for QueueMed Healthcare Platform",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:run": "vitest run",
    "inspector": "npx @modelcontextprotocol/inspector tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@supabase/supabase-js": "^2.74.0",
    "zod": "^3.25.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.8.0",
    "vitest": "^2.1.0"
  }
}
EOF

# Install dependencies
npm install
```

---

## Step 2: TypeScript Configuration

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["../src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
```

---

## Step 3: Environment Configuration

```bash
cat > .env.example << 'EOF'
# ===========================================
# Supabase Configuration
# ===========================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...your-service-key

# ===========================================
# LLM Providers
# ===========================================
# Default: ollama | groq | openai | anthropic
LLM_DEFAULT_PROVIDER=groq

# Groq (Fast cloud inference)
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Ollama (On-prem)
OLLAMA_ENABLED=false
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# OpenAI (Optional)
OPENAI_API_KEY=sk-your-key-here

# Anthropic (Optional)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# ===========================================
# Web Search
# ===========================================
TAVILY_API_KEY=tvly-your-key-here

# ===========================================
# Server Configuration
# ===========================================
NODE_ENV=development
LOG_LEVEL=debug
EOF

# Create actual .env from example
cp .env.example .env
# Then edit .env with your actual credentials
```

---

## Step 4: Create Directory Structure

```bash
mkdir -p src/{tools/{booking,queue,patient,clinic,ml,search},resources,middleware,adapters/{supabase,llm,search},utils}
mkdir -p tests/{tools,integration}
```

---

## Step 5: Core Server Implementation

### 5.1 Entry Point

```typescript
// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPServer } from "./server.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  console.error("QueueMed MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

### 5.2 Server Configuration

```typescript
// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { registerTools, executeToolCall } from "./tools/index.js";
import { registerResources, getResource } from "./resources/index.js";

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

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registerTools(),
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return executeToolCall(name, args || {});
  });

  // Handle resource listing
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: registerResources(),
    };
  });

  // Handle resource reading
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    return getResource(uri);
  });

  return server;
}
```

---

## Step 6: Tool Registry

```typescript
// src/tools/index.ts
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { clinicSearchTool, executeClinicSearch } from "./clinic/search.js";
import { clinicGetInfoTool, executeClinicGetInfo } from "./clinic/getInfo.js";
import { bookingGetAvailabilityTool, executeBookingGetAvailability } from "./booking/getAvailability.js";

// Tool definitions
const tools: Tool[] = [
  clinicSearchTool,
  clinicGetInfoTool,
  bookingGetAvailabilityTool,
  // Add more tools here as implemented
];

// Tool executors
const executors: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  "clinic_search": executeClinicSearch,
  "clinic_getInfo": executeClinicGetInfo,
  "booking_getAvailability": executeBookingGetAvailability,
};

export function registerTools(): Tool[] {
  return tools;
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const executor = executors[name];
  
  if (!executor) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
    };
  }

  try {
    const result = await executor(args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        },
      ],
    };
  }
}
```

---

## Step 7: First Tool - Clinic Search

```typescript
// src/tools/clinic/search.ts
import { z } from "zod";
import { getSupabaseClient } from "../../adapters/supabase/client.js";

// Input schema
const ClinicSearchSchema = z.object({
  query: z.string().min(1).max(100).optional(),
  city: z.string().optional(),
  specialty: z.string().optional(),
  limit: z.number().min(1).max(50).default(10),
});

// Tool definition
export const clinicSearchTool = {
  name: "clinic_search",
  description: `Search for healthcare clinics in Morocco.
  
  Parameters:
  - query: Search term (clinic name, doctor name)
  - city: Filter by city (e.g., "Casablanca", "Rabat")
  - specialty: Filter by medical specialty
  - limit: Maximum results (default: 10)
  
  Returns list of clinics with basic info.`,
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query" },
      city: { type: "string", description: "City name" },
      specialty: { type: "string", description: "Medical specialty" },
      limit: { type: "number", description: "Max results", default: 10 },
    },
  },
};

// Tool executor
export async function executeClinicSearch(
  args: Record<string, unknown>
): Promise<unknown> {
  // Validate input
  const params = ClinicSearchSchema.parse(args);
  
  const supabase = getSupabaseClient();
  
  // Build query
  let query = supabase
    .from("clinics")
    .select("id, name, name_ar, specialty, city, address, phone")
    .eq("is_active", true)
    .limit(params.limit);
  
  if (params.query) {
    query = query.or(`name.ilike.%${params.query}%,name_ar.ilike.%${params.query}%`);
  }
  
  if (params.city) {
    query = query.ilike("city", `%${params.city}%`);
  }
  
  if (params.specialty) {
    query = query.ilike("specialty", `%${params.specialty}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }
  
  return {
    success: true,
    count: data?.length || 0,
    clinics: data?.map(clinic => ({
      id: clinic.id,
      name: clinic.name,
      nameAr: clinic.name_ar,
      specialty: clinic.specialty,
      city: clinic.city,
      address: clinic.address,
      phone: clinic.phone,
    })) || [],
  };
}
```

---

## Step 8: Supabase Adapter

```typescript
// src/adapters/supabase/client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    
    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    }
    
    supabaseClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  
  return supabaseClient;
}
```

---

## Step 9: Resources

```typescript
// src/resources/index.ts
import { Resource } from "@modelcontextprotocol/sdk/types.js";

const resources: Resource[] = [
  {
    uri: "queuemed://policies/emergency",
    name: "Emergency Guidance",
    description: "Emergency contact information for Morocco",
    mimeType: "text/markdown",
  },
  {
    uri: "queuemed://policies/privacy",
    name: "Privacy Policy",
    description: "QueueMed data privacy policy",
    mimeType: "text/markdown",
  },
  {
    uri: "queuemed://schemas/appointment-types",
    name: "Appointment Types",
    description: "Available appointment types and durations",
    mimeType: "application/json",
  },
];

const resourceContents: Record<string, string> = {
  "queuemed://policies/emergency": `
# 🚨 Emergency Guidance - Morocco

## Emergency Numbers
- **SAMU (Emergency Medical)**: 141
- **Police**: 19
- **Fire/Civil Protection**: 15

## ⚠️ Disclaimer
This AI assistant provides general healthcare information only.
It is NOT a substitute for professional medical advice.
For emergencies, call 141 immediately.
`,
  "queuemed://policies/privacy": `
# Privacy Policy

QueueMed is committed to protecting your personal health information.
- We collect only necessary data for appointment management
- Your data is encrypted and stored securely
- We never share your information without consent
`,
  "queuemed://schemas/appointment-types": JSON.stringify([
    { name: "consultation", label: "Consultation", duration: 15 },
    { name: "follow_up", label: "Follow-up", duration: 10 },
    { name: "checkup", label: "Checkup", duration: 15 },
    { name: "procedure", label: "Procedure", duration: 30 },
  ], null, 2),
};

export function registerResources(): Resource[] {
  return resources;
}

export function getResource(uri: string): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  const content = resourceContents[uri];
  
  if (!content) {
    throw new Error(`Resource not found: ${uri}`);
  }
  
  const resource = resources.find(r => r.uri === uri);
  
  return {
    contents: [
      {
        uri,
        mimeType: resource?.mimeType || "text/plain",
        text: content,
      },
    ],
  };
}
```

---

## Step 10: Testing with MCP Inspector

```bash
# Run the MCP Inspector to test your server
npm run inspector

# This opens a web UI where you can:
# 1. See all registered tools
# 2. Execute tools with test parameters
# 3. View resources
# 4. Debug responses
```

---

## Step 11: Add More Tools Incrementally

### Booking Get Availability

```typescript
// src/tools/booking/getAvailability.ts
import { z } from "zod";
import { getSupabaseClient } from "../../adapters/supabase/client.js";

const GetAvailabilitySchema = z.object({
  clinicId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentType: z.string().optional(),
});

export const bookingGetAvailabilityTool = {
  name: "booking_getAvailability",
  description: `Get available appointment slots for a clinic.
  
  Parameters:
  - clinicId: UUID of the clinic
  - date: Date in YYYY-MM-DD format
  - appointmentType: Optional type filter
  
  Returns available time slots.`,
  inputSchema: {
    type: "object" as const,
    properties: {
      clinicId: { type: "string", description: "Clinic UUID" },
      date: { type: "string", description: "Date (YYYY-MM-DD)" },
      appointmentType: { type: "string", description: "Appointment type" },
    },
    required: ["clinicId", "date"],
  },
};

export async function executeBookingGetAvailability(
  args: Record<string, unknown>
): Promise<unknown> {
  const params = GetAvailabilitySchema.parse(args);
  const supabase = getSupabaseClient();
  
  // Get queue mode
  const { data: modeData } = await supabase.rpc("get_queue_mode_for_date", {
    p_clinic_id: params.clinicId,
    p_date: params.date,
  });
  
  let mode = modeData || "slotted";
  if (mode === "ordinal_queue") mode = "fluid";
  if (mode === "time_grid_fixed" || mode === "fixed" || mode === "hybrid") mode = "slotted";
  
  // For fluid mode, no slots needed
  if (mode === "fluid") {
    return {
      success: true,
      mode: "fluid",
      message: "This clinic uses walk-in queue. No time slot selection needed.",
      available: true,
    };
  }
  
  // For slotted mode, get available slots
  const { data: slots, error } = await supabase.rpc("get_available_slots_for_mode", {
    p_clinic_id: params.clinicId,
    p_appointment_date: params.date,
    p_appointment_type: params.appointmentType || "consultation",
  });
  
  if (error) {
    throw new Error(`Failed to get slots: ${error.message}`);
  }
  
  return {
    success: true,
    mode: "slotted",
    date: params.date,
    slots: slots?.slots || [],
  };
}
```

---

## Step 12: Run and Verify

```bash
# Development mode with hot reload
npm run dev

# Test with inspector
npm run inspector

# Build for production
npm run build
npm start
```

---

## 🎯 Verification Checklist

After each phase, verify:

- [ ] Server starts without errors
- [ ] MCP Inspector shows all tools
- [ ] Tools execute successfully
- [ ] Resources are accessible
- [ ] Error handling works correctly
- [ ] Unit tests pass

---

## 📚 Next Implementation Steps

After Phase 1 is complete:

1. **Add Authentication Middleware** (Phase 2)
2. **Add Queue Tools** (Phase 2)
3. **Add Patient Tools** (Phase 2)
4. **Add LLM Provider Layer** (Phase 3)
5. **Add Web Search** (Phase 3)
6. **Add Security Middleware** (Phase 4)
7. **Integrate with Frontend** (Phase 5)

---

## 🆘 Troubleshooting

### Common Issues

**"Cannot find module"**
```bash
# Ensure TypeScript is compiled
npm run build
```

**"SUPABASE_URL not defined"**
```bash
# Check .env file exists and has correct values
cat .env
```

**"Tool not found"**
```bash
# Ensure tool is registered in src/tools/index.ts
```

---

*Follow this guide step by step. Each step builds on the previous one.*

