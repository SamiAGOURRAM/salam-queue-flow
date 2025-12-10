# 🏥 QueueMed MCP Architecture - Healthcare AI Revolution

**Version**: 1.0.0  
**Status**: Architecture Design  
**Goal**: Build a Palantir-grade, extensible MCP server for Moroccan healthcare transformation

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Philosophy](#architecture-philosophy)
3. [System Architecture](#system-architecture)
4. [MCP Server Design](#mcp-server-design)
5. [Tool Definitions](#tool-definitions)
6. [Resource Definitions](#resource-definitions)
7. [LLM Provider Strategy](#llm-provider-strategy)
8. [Web Search Integration](#web-search-integration)
9. [Security & Compliance](#security--compliance)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Guide](#deployment-guide)

---

## 🎯 Executive Summary

### Vision
Build an intelligent healthcare assistant that leverages the Model Context Protocol (MCP) to provide:
- **Real-time queue intelligence** - Wait time predictions, position updates
- **Smart booking** - AI-powered appointment scheduling with availability awareness
- **Clinical decision support** - Symptom guidance with safety guardrails
- **Operational insights** - Clinic analytics and optimization recommendations

### Key Differentiators
- **Standalone MCP server** - Fully testable before integration
- **Multi-LLM support** - On-prem (Ollama/vLLM) + cloud (Groq/OpenAI/Anthropic)
- **Web search integration** - Real-time healthcare information retrieval
- **Moroccan context** - Arabic-first, local healthcare regulations
- **Enterprise-grade security** - PHI protection, audit trails, role-based access

---

## 🏛️ Architecture Philosophy

### Core Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SEPARATION OF CONCERNS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │  MCP Server │     │   Gateway   │     │   Frontend  │                  │
│   │  (Tools +   │────▶│  (Auth +    │────▶│   (Chat +   │                  │
│   │  Resources) │     │  Policy)    │     │   UI)       │                  │
│   └─────────────┘     └─────────────┘     └─────────────┘                  │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│   Stateless API      Rate Limiting      Role-Aware UI                      │
│   Pure Functions     PHI Redaction      Confirmations                      │
│   JSON Schemas       Audit Logging      Accessibility                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **MCP over custom API** | Standard protocol, tool ecosystem, client compatibility |
| **TypeScript server** | Matches existing stack, type safety, shared models |
| **Multi-provider LLM** | Flexibility, cost optimization, data residency options |
| **Event-driven tools** | Leverage existing EventBus, consistent with architecture |
| **Repository pattern** | Reuse existing data layer, testability |

---

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ React Chat   │  │ Cursor IDE   │  │ Mobile App   │  │ API Clients  │        │
│  │ Widget       │  │ (Dev Tools)  │  │ (Future)     │  │ (B2B)        │        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GATEWAY LAYER                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         AI Gateway Service                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Auth/JWT    │  │ Rate Limit  │  │ PHI Filter  │  │ Audit Log   │    │   │
│  │  │ Validation  │  │ (per-user)  │  │ (redaction) │  │ (metadata)  │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                     ┌────────────────┼────────────────┐
                     ▼                ▼                ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────┐
│     MCP SERVER          │  │     LLM PROVIDERS       │  │   WEB SEARCH        │
│  ┌─────────────────┐    │  │  ┌─────────────────┐    │  │  ┌───────────────┐  │
│  │ Tools           │    │  │  │ On-Prem         │    │  │  │ Tavily        │  │
│  │ • booking.*     │    │  │  │ • Ollama        │    │  │  │ (Healthcare)  │  │
│  │ • queue.*       │    │  │  │ • vLLM          │    │  │  └───────────────┘  │
│  │ • patient.*     │    │  │  │ • LocalAI       │    │  │  ┌───────────────┐  │
│  │ • clinic.*      │    │  │  └─────────────────┘    │  │  │ Bing/Google   │  │
│  │ • ml.*          │    │  │  ┌─────────────────┐    │  │  │ (General)     │  │
│  │ • search.*      │    │  │  │ Cloud           │    │  │  └───────────────┘  │
│  └─────────────────┘    │  │  │ • Groq (fast)   │    │  └─────────────────────┘
│  ┌─────────────────┐    │  │  │ • OpenAI        │    │
│  │ Resources       │    │  │  │ • Anthropic     │    │
│  │ • policies      │    │  │  │ • Azure OpenAI  │    │
│  │ • templates     │    │  │  └─────────────────┘    │
│  │ • schemas       │    │  └─────────────────────────┘
│  └─────────────────┘    │
└─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    Existing Service Layer                                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Booking     │  │ Queue       │  │ Patient     │  │ Clinic      │    │   │
│  │  │ Service     │  │ Service     │  │ Service     │  │ Service     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
│  │  │ Staff       │  │ ML/Wait     │  │ Notification│  │ Analytics   │    │   │
│  │  │ Service     │  │ Estimation  │  │ Service     │  │ Service     │    │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Supabase (PostgreSQL)                            │   │
│  │  • RLS Policies  • RPC Functions  • Real-time  • Edge Functions         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 MCP Server Design

### Directory Structure

```
mcp-server/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts                    # Server entry point
│   ├── server.ts                   # MCP server configuration
│   │
│   ├── tools/                      # Tool definitions
│   │   ├── index.ts                # Tool registry
│   │   ├── booking/
│   │   │   ├── getAvailability.ts
│   │   │   ├── bookAppointment.ts
│   │   │   ├── cancelAppointment.ts
│   │   │   └── schemas.ts
│   │   ├── queue/
│   │   │   ├── getPosition.ts
│   │   │   ├── getWaitTime.ts
│   │   │   ├── callNextPatient.ts   # Staff only
│   │   │   └── schemas.ts
│   │   ├── patient/
│   │   │   ├── getProfile.ts
│   │   │   ├── getAppointments.ts
│   │   │   └── schemas.ts
│   │   ├── clinic/
│   │   │   ├── search.ts
│   │   │   ├── getInfo.ts
│   │   │   ├── getSchedule.ts
│   │   │   └── schemas.ts
│   │   ├── ml/
│   │   │   ├── estimateWaitTime.ts
│   │   │   └── schemas.ts
│   │   └── search/
│   │       ├── webSearch.ts
│   │       ├── healthcareSearch.ts
│   │       └── schemas.ts
│   │
│   ├── resources/                  # Resource definitions
│   │   ├── index.ts
│   │   ├── policies/
│   │   │   ├── privacyPolicy.ts
│   │   │   ├── emergencyGuidance.ts
│   │   │   └── disclaimers.ts
│   │   ├── templates/
│   │   │   ├── appointmentTypes.ts
│   │   │   └── specialties.ts
│   │   └── schemas/
│   │       └── apiSchemas.ts
│   │
│   ├── middleware/                 # Request processing
│   │   ├── auth.ts                 # JWT validation
│   │   ├── rateLimit.ts            # Rate limiting
│   │   ├── phiFilter.ts            # PHI redaction
│   │   ├── roleGuard.ts            # RBAC enforcement
│   │   └── auditLog.ts             # Audit logging
│   │
│   ├── adapters/                   # External integrations
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── repositories.ts     # Reuse from main app
│   │   ├── llm/
│   │   │   ├── provider.ts         # LLM abstraction
│   │   │   ├── ollama.ts           # On-prem
│   │   │   ├── groq.ts             # Cloud (fast)
│   │   │   ├── openai.ts           # Cloud (capable)
│   │   │   └── anthropic.ts        # Cloud (safe)
│   │   └── search/
│   │       ├── tavily.ts           # Healthcare search
│   │       └── bing.ts             # General search
│   │
│   ├── context/                    # Context management
│   │   ├── sessionContext.ts       # User session
│   │   ├── clinicContext.ts        # Clinic scope
│   │   └── conversationContext.ts  # Chat history
│   │
│   └── utils/
│       ├── errors.ts               # Custom errors
│       ├── logger.ts               # Structured logging
│       ├── validators.ts           # Input validation
│       └── sanitizers.ts           # Output sanitization
│
├── tests/
│   ├── tools/                      # Tool unit tests
│   ├── integration/                # Integration tests
│   └── e2e/                        # End-to-end tests
│
└── scripts/
    ├── test-local.ts               # Local testing script
    └── inspector.ts                # MCP inspector wrapper
```

### Server Configuration

```typescript
// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export function createMCPServer(config: ServerConfig) {
  const server = new Server(
    {
      name: "queuemed-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Register tools
  registerBookingTools(server);
  registerQueueTools(server);
  registerPatientTools(server);
  registerClinicTools(server);
  registerMLTools(server);
  registerSearchTools(server);

  // Register resources
  registerPolicyResources(server);
  registerTemplateResources(server);

  return server;
}
```

---

## 🛠️ Tool Definitions

### Tool Categories & Mapping to Services

| Category | Tool | Service Method | Role Access |
|----------|------|----------------|-------------|
| **Booking** | `booking.getAvailability` | `BookingService.getAvailableSlotsForMode` | Patient, Staff |
| | `booking.create` | `BookingService.bookAppointmentForMode` | Patient, Staff |
| | `booking.cancel` | `QueueService.cancelAppointment` | Patient, Staff |
| **Queue** | `queue.getPosition` | `QueueService.getQueueEntry` | Patient |
| | `queue.getSchedule` | `QueueService.getDailySchedule` | Staff |
| | `queue.callNext` | `QueueService.callNextPatient` | Staff |
| | `queue.markAbsent` | `QueueService.markAbsent` | Staff |
| **Patient** | `patient.getProfile` | `PatientService.getPatientProfile` | Self, Staff |
| | `patient.getAppointments` | `QueueService.getPatientAppointments` | Self, Staff |
| **Clinic** | `clinic.search` | `ClinicRepository.search` | Public |
| | `clinic.getInfo` | `ClinicService.getClinic` | Public |
| **ML** | `ml.estimateWaitTime` | `WaitTimeEstimationService.estimateWaitTime` | Patient, Staff |
| **Search** | `search.healthcare` | Tavily API | All |
| | `search.clinics` | `ClinicRepository.search` | Public |

### Tool Schema Examples

```typescript
// src/tools/booking/schemas.ts
import { z } from "zod";

export const GetAvailabilitySchema = z.object({
  clinicId: z.string().uuid("Invalid clinic ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  appointmentType: z.enum([
    "consultation",
    "follow_up",
    "checkup",
    "procedure",
  ]).optional(),
});

export const BookAppointmentSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), // Optional for fluid queue
  appointmentType: z.enum(["consultation", "follow_up", "checkup", "procedure"]),
  reasonForVisit: z.string().max(500).optional(),
});

// Tool definition
export const getAvailabilityTool = {
  name: "booking_getAvailability",
  description: `Get available appointment slots for a clinic on a specific date.
  
  Returns:
  - In 'slotted' mode: Array of time slots with availability status
  - In 'fluid' mode: Confirmation that queue is open for the day
  
  Use this before booking to show patients their options.`,
  inputSchema: {
    type: "object",
    properties: {
      clinicId: { type: "string", description: "UUID of the clinic" },
      date: { type: "string", description: "Date in YYYY-MM-DD format" },
      appointmentType: { 
        type: "string", 
        enum: ["consultation", "follow_up", "checkup", "procedure"],
        description: "Type of appointment (affects duration)"
      },
    },
    required: ["clinicId", "date"],
  },
};
```

### Tool Implementation Pattern

```typescript
// src/tools/booking/getAvailability.ts
import { BookingService } from "@/services/booking/BookingService";
import { GetAvailabilitySchema } from "./schemas";
import { AuthContext } from "../../middleware/auth";
import { auditLog } from "../../middleware/auditLog";
import { logger } from "../../utils/logger";

export async function getAvailability(
  params: unknown,
  context: AuthContext
) {
  // 1. Validate input
  const validated = GetAvailabilitySchema.parse(params);
  
  // 2. Log the request (no PHI in params)
  logger.info("Tool called: booking.getAvailability", {
    clinicId: validated.clinicId,
    date: validated.date,
    userId: context.userId,
    role: context.role,
  });
  
  // 3. Execute business logic
  const bookingService = new BookingService();
  const result = await bookingService.getAvailableSlotsForMode(
    validated.clinicId,
    validated.date,
    validated.appointmentType
  );
  
  // 4. Audit log
  await auditLog({
    action: "booking.getAvailability",
    userId: context.userId,
    clinicId: validated.clinicId,
    metadata: { date: validated.date, slotsReturned: result.slots?.length || 0 },
  });
  
  // 5. Return sanitized result
  return {
    success: true,
    mode: result.mode,
    available: result.available,
    slots: result.slots?.map(slot => ({
      time: slot.time,
      available: slot.available,
      remainingCapacity: slot.remainingCapacity,
    })),
  };
}
```

---

## 📚 Resource Definitions

### Static Resources

```typescript
// src/resources/policies/emergencyGuidance.ts
export const emergencyGuidanceResource = {
  uri: "queuemed://resources/policies/emergency",
  name: "Emergency Guidance",
  description: "Emergency contact information and triage guidance for Morocco",
  mimeType: "text/markdown",
  content: `
# 🚨 Emergency Guidance - Morocco

## Emergency Numbers
- **SAMU (Emergency Medical)**: 141
- **Police**: 19
- **Fire/Civil Protection**: 15
- **Royal Gendarmerie**: 177

## When to Seek Emergency Care
This AI assistant cannot provide medical diagnoses. Seek immediate emergency care if you experience:
- Chest pain or difficulty breathing
- Severe bleeding
- Loss of consciousness
- Signs of stroke (face drooping, arm weakness, speech difficulty)
- Severe allergic reactions
- High fever with confusion

## Disclaimer
This assistant provides general healthcare information only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.

---
*QueueMed - Transforming Moroccan Healthcare*
  `,
};
```

### Dynamic Resources

```typescript
// src/resources/templates/appointmentTypes.ts
export async function getAppointmentTypesResource(clinicId: string) {
  const bookingService = new BookingService();
  const { appointmentTypes } = await bookingService.getClinicInfo(clinicId);
  
  return {
    uri: `queuemed://resources/clinic/${clinicId}/appointment-types`,
    name: "Appointment Types",
    description: `Available appointment types for clinic ${clinicId}`,
    mimeType: "application/json",
    content: JSON.stringify(appointmentTypes, null, 2),
  };
}
```

---

## 🤖 LLM Provider Strategy

### Multi-Provider Architecture

```typescript
// src/adapters/llm/provider.ts
export interface LLMProvider {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): LLMCapabilities;
}

export interface LLMCapabilities {
  maxTokens: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  costPer1kTokens: number;
  latencyMs: number; // Average
}

// Provider selection strategy
export class LLMProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string;
  
  constructor(config: LLMConfig) {
    // Initialize providers based on config
    if (config.ollama?.enabled) {
      this.providers.set("ollama", new OllamaProvider(config.ollama));
    }
    if (config.groq?.apiKey) {
      this.providers.set("groq", new GroqProvider(config.groq));
    }
    if (config.openai?.apiKey) {
      this.providers.set("openai", new OpenAIProvider(config.openai));
    }
    if (config.anthropic?.apiKey) {
      this.providers.set("anthropic", new AnthropicProvider(config.anthropic));
    }
    
    this.defaultProvider = config.defaultProvider || "groq";
  }
  
  async selectProvider(requirements: ProviderRequirements): Promise<LLMProvider> {
    // Priority: On-prem > Fast cloud > Capable cloud
    
    // 1. Try on-prem first (data residency)
    if (requirements.requiresOnPrem) {
      const ollama = this.providers.get("ollama");
      if (ollama && await ollama.isAvailable()) {
        return ollama;
      }
      throw new Error("On-prem LLM required but not available");
    }
    
    // 2. For speed-sensitive operations
    if (requirements.lowLatency) {
      const groq = this.providers.get("groq");
      if (groq && await groq.isAvailable()) {
        return groq;
      }
    }
    
    // 3. For complex reasoning
    if (requirements.complexReasoning) {
      const anthropic = this.providers.get("anthropic");
      if (anthropic && await anthropic.isAvailable()) {
        return anthropic;
      }
    }
    
    // 4. Fallback to default
    return this.providers.get(this.defaultProvider)!;
  }
}
```

### Ollama On-Prem Setup

```typescript
// src/adapters/llm/ollama.ts
import { Ollama } from "ollama";

export class OllamaProvider implements LLMProvider {
  private client: Ollama;
  private model: string;
  
  constructor(config: OllamaConfig) {
    this.client = new Ollama({
      host: config.host || "http://localhost:11434",
    });
    this.model = config.model || "llama3.1:8b"; // Or mistral, codellama
  }
  
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat({
      model: this.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options?.temperature || 0.7,
        num_predict: options?.maxTokens || 2048,
      },
    });
    
    return {
      content: response.message.content,
      usage: {
        promptTokens: response.prompt_eval_count,
        completionTokens: response.eval_count,
      },
    };
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }
  
  getCapabilities(): LLMCapabilities {
    return {
      maxTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true, // Ollama 0.4+ supports tools
      supportsVision: false,
      costPer1kTokens: 0, // Free on-prem
      latencyMs: 500, // Depends on hardware
    };
  }
}
```

### Provider Configuration

```typescript
// .env.example
# ===========================================
# LLM Provider Configuration
# ===========================================

# Default provider: ollama | groq | openai | anthropic
LLM_DEFAULT_PROVIDER=groq

# On-Prem (Ollama)
OLLAMA_ENABLED=true
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Cloud - Groq (Fast)
GROQ_API_KEY=gsk_xxxxx
GROQ_MODEL=llama-3.3-70b-versatile

# Cloud - OpenAI (Capable)
OPENAI_API_KEY=sk-xxxxx
OPENAI_MODEL=gpt-4o-mini

# Cloud - Anthropic (Safe)
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# ===========================================
# Web Search Configuration
# ===========================================
TAVILY_API_KEY=tvly-xxxxx
BING_API_KEY=xxxxx
```

---

## 🔍 Web Search Integration

### Healthcare-Focused Search

```typescript
// src/adapters/search/tavily.ts
import { tavily } from "@tavily/core";

export class TavilySearchProvider {
  private client: ReturnType<typeof tavily>;
  
  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }
  
  async searchHealthcare(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const response = await this.client.search(query, {
      searchDepth: "advanced",
      includeAnswer: true,
      maxResults: options?.maxResults || 5,
      includeDomains: [
        // Trusted healthcare sources
        "who.int",
        "nih.gov",
        "mayoclinic.org",
        "webmd.com",
        "sante.gov.ma", // Morocco Ministry of Health
        "fmp.ac.ma",    // Moroccan medical faculty
      ],
      excludeDomains: [
        // Exclude unreliable sources
        "reddit.com",
        "quora.com",
      ],
    });
    
    return response.results.map(r => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));
  }
  
  async searchClinics(query: string, location?: string): Promise<SearchResult[]> {
    const locationQuery = location ? `${query} near ${location} Morocco` : `${query} Morocco`;
    
    const response = await this.client.search(locationQuery, {
      searchDepth: "basic",
      includeAnswer: false,
      maxResults: 10,
      includeDomains: [
        "doctolib.ma",
        "sehati.gov.ma",
        "annuaire-medical.ma",
      ],
    });
    
    return response.results;
  }
}
```

### Search Tool Implementation

```typescript
// src/tools/search/healthcareSearch.ts
export const healthcareSearchTool = {
  name: "search_healthcare",
  description: `Search for healthcare information from trusted medical sources.
  
  Use this when the user asks about:
  - Medical conditions or symptoms (general information only)
  - Treatment options (for awareness, not prescription)
  - Healthcare facilities in Morocco
  - Health guidelines and recommendations
  
  IMPORTANT: Always include the emergency guidance disclaimer with results.`,
  inputSchema: {
    type: "object",
    properties: {
      query: { 
        type: "string", 
        description: "Healthcare-related search query",
        maxLength: 200,
      },
      language: {
        type: "string",
        enum: ["ar", "fr", "en"],
        description: "Preferred language for results",
        default: "ar",
      },
    },
    required: ["query"],
  },
};

export async function executeHealthcareSearch(
  params: { query: string; language?: string },
  context: AuthContext
): Promise<ToolResult> {
  const searchProvider = new TavilySearchProvider(process.env.TAVILY_API_KEY!);
  
  // Add safety context to query
  const safeQuery = `${params.query} (medical information educational)`;
  
  const results = await searchProvider.searchHealthcare(safeQuery, {
    maxResults: 5,
  });
  
  // Log search (no query details for privacy)
  logger.info("Healthcare search executed", {
    userId: context.userId,
    resultCount: results.length,
  });
  
  return {
    success: true,
    results: results.map(r => ({
      title: r.title,
      snippet: r.content.substring(0, 300),
      source: r.url,
      relevanceScore: r.score,
    })),
    disclaimer: `⚠️ This information is for educational purposes only. 
    It is not a substitute for professional medical advice.
    For emergencies, call SAMU: 141`,
  };
}
```

---

## 🔒 Security & Compliance

### Authentication Flow

```typescript
// src/middleware/auth.ts
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

export interface AuthContext {
  userId: string;
  role: "patient" | "staff" | "clinic_owner" | "admin";
  clinicId?: string;
  staffId?: string;
  patientId?: string;
  permissions: string[];
}

export async function validateAuth(token: string): Promise<AuthContext> {
  // 1. Verify JWT with Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new UnauthorizedError("Invalid or expired token");
  }
  
  // 2. Get user roles and permissions
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role, clinic_id")
    .eq("user_id", user.id);
  
  // 3. Build context
  const primaryRole = determinePrimaryRole(roles);
  
  return {
    userId: user.id,
    role: primaryRole,
    clinicId: roles?.find(r => r.clinic_id)?.clinic_id,
    permissions: getPermissionsForRole(primaryRole),
  };
}
```

### Role-Based Access Control

```typescript
// src/middleware/roleGuard.ts
export const toolPermissions: Record<string, string[]> = {
  // Public tools
  "clinic_search": ["*"],
  "clinic_getInfo": ["*"],
  "search_healthcare": ["*"],
  
  // Patient tools
  "booking_getAvailability": ["patient", "staff", "clinic_owner"],
  "booking_create": ["patient", "staff", "clinic_owner"],
  "booking_cancel": ["patient", "staff", "clinic_owner"],
  "queue_getPosition": ["patient", "staff", "clinic_owner"],
  "patient_getProfile": ["patient", "staff", "clinic_owner"], // Self or staff
  "patient_getAppointments": ["patient", "staff", "clinic_owner"],
  "ml_estimateWaitTime": ["patient", "staff", "clinic_owner"],
  
  // Staff-only tools
  "queue_getSchedule": ["staff", "clinic_owner"],
  "queue_callNext": ["staff", "clinic_owner"],
  "queue_markAbsent": ["staff", "clinic_owner"],
  "queue_markPresent": ["staff", "clinic_owner"],
  
  // Admin tools
  "clinic_updateSettings": ["clinic_owner"],
  "staff_manage": ["clinic_owner"],
};

export function checkPermission(
  tool: string,
  context: AuthContext,
  params: Record<string, unknown>
): boolean {
  const allowedRoles = toolPermissions[tool];
  
  if (!allowedRoles) {
    return false; // Unknown tool = deny
  }
  
  if (allowedRoles.includes("*")) {
    return true; // Public tool
  }
  
  if (!allowedRoles.includes(context.role)) {
    return false; // Role not allowed
  }
  
  // Additional checks for resource ownership
  if (context.role === "patient") {
    // Patients can only access their own data
    if (params.patientId && params.patientId !== context.patientId) {
      return false;
    }
  }
  
  if (["staff", "clinic_owner"].includes(context.role)) {
    // Staff can only access their clinic's data
    if (params.clinicId && params.clinicId !== context.clinicId) {
      return false;
    }
  }
  
  return true;
}
```

### PHI Protection

```typescript
// src/middleware/phiFilter.ts
export const PHI_PATTERNS = {
  phoneNumber: /(\+?212|0)[567]\d{8}/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  nationalId: /[A-Z]{1,2}\d{6,}/g, // Moroccan CIN pattern
};

export function redactPHI(text: string): string {
  let redacted = text;
  
  for (const [type, pattern] of Object.entries(PHI_PATTERNS)) {
    redacted = redacted.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
  }
  
  return redacted;
}

export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = [
    "phoneNumber",
    "phone_number",
    "email",
    "fullName",
    "full_name",
    "address",
    "nationalId",
  ];
  
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  }
  
  return sanitized;
}
```

### Audit Logging

```typescript
// src/middleware/auditLog.ts
export interface AuditEntry {
  timestamp: Date;
  action: string;
  userId: string;
  userRole: string;
  clinicId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome: "success" | "failure" | "denied";
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function auditLog(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  const fullEntry: AuditEntry = {
    ...entry,
    timestamp: new Date(),
  };
  
  // Log to structured logger (for SIEM integration)
  logger.info("AUDIT", sanitizeForLogging(fullEntry));
  
  // Store in database for compliance
  const supabase = getServiceClient();
  await supabase.from("audit_logs").insert({
    timestamp: fullEntry.timestamp.toISOString(),
    action: fullEntry.action,
    user_id: fullEntry.userId,
    user_role: fullEntry.userRole,
    clinic_id: fullEntry.clinicId,
    resource_type: fullEntry.resourceType,
    resource_id: fullEntry.resourceId,
    outcome: fullEntry.outcome,
    metadata: fullEntry.metadata,
    ip_address: fullEntry.ipAddress,
  });
}
```

---

## 📋 Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: MCP Server Foundation                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ☐ 1.1 Project Setup                                                        │
│   • Initialize mcp-server/ with TypeScript                                  │
│   • Configure @modelcontextprotocol/sdk                                     │
│   • Set up testing framework (Vitest)                                       │
│   • Create .env configuration                                               │
│                                                                             │
│ ☐ 1.2 Core Infrastructure                                                  │
│   • Implement server.ts with MCP protocol                                   │
│   • Create tool registry pattern                                            │
│   • Create resource registry pattern                                        │
│   • Set up structured logging                                               │
│                                                                             │
│ ☐ 1.3 Supabase Adapter                                                     │
│   • Port existing repository classes                                        │
│   • Configure service-role client                                           │
│   • Test database connectivity                                              │
│                                                                             │
│ ☐ 1.4 First Tools (Read-Only)                                              │
│   • clinic.search (public)                                                  │
│   • clinic.getInfo (public)                                                 │
│   • booking.getAvailability (auth required)                                 │
│                                                                             │
│ Deliverable: Standalone MCP server with 3 working tools                     │
│ Test: MCP Inspector verification                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Core Tools (Week 3-4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Core Healthcare Tools                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ☐ 2.1 Authentication Middleware                                            │
│   • JWT validation with Supabase                                            │
│   • Role extraction and context building                                    │
│   • Permission checking                                                     │
│                                                                             │
│ ☐ 2.2 Booking Tools                                                        │
│   • booking.create (with validation)                                        │
│   • booking.cancel                                                          │
│   • booking.getQueueMode                                                    │
│                                                                             │
│ ☐ 2.3 Queue Tools                                                          │
│   • queue.getPosition                                                       │
│   • queue.getSchedule (staff)                                               │
│   • queue.callNext (staff)                                                  │
│   • queue.markAbsent (staff)                                                │
│                                                                             │
│ ☐ 2.4 Patient Tools                                                        │
│   • patient.getProfile                                                      │
│   • patient.getAppointments                                                 │
│                                                                             │
│ Deliverable: Full CRUD tools with RBAC                                      │
│ Test: Integration tests with mock auth                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Intelligence Layer (Week 5-6)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: AI & Search Integration                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ☐ 3.1 LLM Provider Layer                                                   │
│   • Ollama adapter (on-prem)                                                │
│   • Groq adapter (fast cloud)                                               │
│   • Provider selection strategy                                             │
│   • Fallback chain                                                          │
│                                                                             │
│ ☐ 3.2 Web Search Integration                                               │
│   • Tavily healthcare search                                                │
│   • Result filtering and ranking                                            │
│   • Safety disclaimers                                                      │
│                                                                             │
│ ☐ 3.3 ML Tools                                                             │
│   • ml.estimateWaitTime                                                     │
│   • Integration with WaitTimeEstimationService                              │
│                                                                             │
│ ☐ 3.4 Resources                                                            │
│   • Emergency guidance                                                      │
│   • Privacy policy                                                          │
│   • Appointment type schemas                                                │
│                                                                             │
│ Deliverable: AI-powered MCP server                                          │
│ Test: E2E tests with real LLM calls                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Security & Compliance (Week 7-8)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Enterprise Hardening                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ☐ 4.1 Security Middleware                                                  │
│   • Rate limiting (per-user, per-clinic)                                    │
│   • PHI redaction in logs                                                   │
│   • Input validation hardening                                              │
│   • Output sanitization                                                     │
│                                                                             │
│ ☐ 4.2 Audit & Compliance                                                   │
│   • Comprehensive audit logging                                             │
│   • Audit log database table                                                │
│   • Compliance reporting endpoints                                          │
│                                                                             │
│ ☐ 4.3 Error Handling                                                       │
│   • Graceful degradation                                                    │
│   • User-friendly error messages                                            │
│   • Error tracking (Sentry integration)                                     │
│                                                                             │
│ ☐ 4.4 Documentation                                                        │
│   • API documentation                                                       │
│   • Tool usage guidelines                                                   │
│   • Security best practices                                                 │
│                                                                             │
│ Deliverable: Production-ready MCP server                                    │
│ Test: Security audit, load testing                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: Integration (Week 9-10)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Frontend Integration                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ☐ 5.1 Gateway Service                                                      │
│   • Express gateway with MCP client                                         │
│   • Session management                                                      │
│   • Conversation history                                                    │
│                                                                             │
│ ☐ 5.2 Chat Widget Update                                                   │
│   • Connect to MCP gateway                                                  │
│   • Tool result rendering                                                   │
│   • Streaming support                                                       │
│                                                                             │
│ ☐ 5.3 Role-Aware UI                                                        │
│   • Patient chat experience                                                 │
│   • Staff chat experience                                                   │
│   • Confirmation dialogs for actions                                        │
│                                                                             │
│ Deliverable: Fully integrated AI assistant                                  │
│ Test: User acceptance testing                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// tests/tools/booking/getAvailability.test.ts
import { describe, it, expect, vi } from "vitest";
import { getAvailability } from "../../../src/tools/booking/getAvailability";

describe("booking.getAvailability", () => {
  it("should return available slots for slotted mode", async () => {
    const mockContext = {
      userId: "user-123",
      role: "patient",
      permissions: ["booking.getAvailability"],
    };
    
    const result = await getAvailability(
      {
        clinicId: "clinic-456",
        date: "2025-01-15",
      },
      mockContext
    );
    
    expect(result.success).toBe(true);
    expect(result.mode).toBe("slotted");
    expect(result.slots).toBeDefined();
  });
  
  it("should reject invalid date format", async () => {
    await expect(
      getAvailability({ clinicId: "clinic-456", date: "invalid" }, mockContext)
    ).rejects.toThrow();
  });
  
  it("should deny access without authentication", async () => {
    await expect(
      getAvailability({ clinicId: "clinic-456", date: "2025-01-15" }, null)
    ).rejects.toThrow("Unauthorized");
  });
});
```

### Integration Tests

```typescript
// tests/integration/booking-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "../utils/testServer";
import { createTestUser, cleanupTestUser } from "../utils/testData";

describe("Booking Flow Integration", () => {
  let server: TestServer;
  let testUser: TestUser;
  
  beforeAll(async () => {
    server = await createTestServer();
    testUser = await createTestUser({ role: "patient" });
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser);
    await server.close();
  });
  
  it("should complete full booking flow", async () => {
    // 1. Get availability
    const availability = await server.callTool("booking_getAvailability", {
      clinicId: testUser.clinicId,
      date: "2025-01-15",
    }, testUser.token);
    
    expect(availability.success).toBe(true);
    expect(availability.slots.length).toBeGreaterThan(0);
    
    // 2. Book appointment
    const availableSlot = availability.slots.find(s => s.available);
    const booking = await server.callTool("booking_create", {
      clinicId: testUser.clinicId,
      patientId: testUser.patientId,
      appointmentDate: "2025-01-15",
      scheduledTime: availableSlot.time,
      appointmentType: "consultation",
    }, testUser.token);
    
    expect(booking.success).toBe(true);
    expect(booking.appointmentId).toBeDefined();
    
    // 3. Get queue position
    const position = await server.callTool("queue_getPosition", {
      appointmentId: booking.appointmentId,
    }, testUser.token);
    
    expect(position.success).toBe(true);
    expect(position.position).toBeGreaterThan(0);
  });
});
```

### Local Testing Script

```typescript
// scripts/test-local.ts
import { createMCPServer } from "../src/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

async function testLocally() {
  console.log("🧪 Starting local MCP server test...\n");
  
  // Create server
  const server = createMCPServer({
    environment: "test",
  });
  
  // Create test client
  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });
  
  // Connect client to server
  await client.connect(server.transport);
  
  // Test 1: List tools
  console.log("📋 Available tools:");
  const tools = await client.listTools();
  tools.tools.forEach(t => console.log(`  - ${t.name}: ${t.description?.slice(0, 50)}...`));
  
  // Test 2: Call a public tool
  console.log("\n🔍 Testing clinic.search...");
  const searchResult = await client.callTool("clinic_search", {
    query: "dermatologie",
    city: "Casablanca",
  });
  console.log("Result:", JSON.stringify(searchResult, null, 2));
  
  // Test 3: List resources
  console.log("\n📚 Available resources:");
  const resources = await client.listResources();
  resources.resources.forEach(r => console.log(`  - ${r.uri}: ${r.name}`));
  
  console.log("\n✅ Local test completed successfully!");
  
  await client.close();
}

testLocally().catch(console.error);
```

---

## 🚀 Deployment Guide

### Development Setup

```bash
# 1. Clone and setup
cd salam-queue-flow
mkdir mcp-server
cd mcp-server
npm init -y

# 2. Install dependencies
npm install @modelcontextprotocol/sdk zod dotenv
npm install -D typescript vitest @types/node tsx

# 3. Initialize TypeScript
npx tsc --init

# 4. Create directory structure
mkdir -p src/{tools,resources,middleware,adapters,utils}
mkdir -p tests/{tools,integration,e2e}

# 5. Start development
npm run dev
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY dist/ ./dist/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:3001/health')"

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### Docker Compose (Full Stack)

```yaml
# docker-compose.yml
version: '3.8'

services:
  mcp-server:
    build: ./mcp-server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - GROQ_API_KEY=${GROQ_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
    depends_on:
      - ollama
    networks:
      - queuemed

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    networks:
      - queuemed

  gateway:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - MCP_SERVER_URL=http://mcp-server:3001
      - GROQ_API_KEY=${GROQ_API_KEY}
    depends_on:
      - mcp-server
    networks:
      - queuemed

volumes:
  ollama-data:

networks:
  queuemed:
    driver: bridge
```

### Kubernetes Deployment

```yaml
# k8s/mcp-server-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: queuemed-mcp-server
  labels:
    app: queuemed-mcp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: queuemed-mcp
  template:
    metadata:
      labels:
        app: queuemed-mcp
    spec:
      containers:
      - name: mcp-server
        image: queuemed/mcp-server:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: SUPABASE_URL
          valueFrom:
            secretKeyRef:
              name: queuemed-secrets
              key: supabase-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: queuemed-mcp-service
spec:
  selector:
    app: queuemed-mcp
  ports:
  - port: 3001
    targetPort: 3001
  type: ClusterIP
```

---

## 📊 Success Metrics

### Technical KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tool response time | < 500ms p95 | Prometheus |
| LLM latency | < 2s p95 | Prometheus |
| Error rate | < 1% | Error tracking |
| Availability | 99.9% | Uptime monitoring |

### Business KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Chat completion rate | > 80% | Analytics |
| Booking conversion | > 30% | Funnel tracking |
| User satisfaction | > 4.5/5 | Feedback surveys |
| Support ticket reduction | 50% | Support metrics |

---

## 🏁 Next Steps

1. **Approve this architecture** - Review and finalize design decisions
2. **Create mcp-server/ directory** - Initialize project structure
3. **Implement Phase 1** - Foundation with first 3 tools
4. **Test with MCP Inspector** - Verify protocol compliance
5. **Iterate** - Add tools incrementally with tests

---

*This architecture is designed to be Palantir-grade: robust, extensible, and transformative for Moroccan healthcare.*

**QueueMed - ثورة في الرعاية الصحية المغربية**

