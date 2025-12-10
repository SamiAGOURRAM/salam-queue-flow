# 🏥 QueueMed MCP Server

**Model Context Protocol Server for QueueMed Healthcare Platform**

This MCP server exposes healthcare tools and resources to AI assistants, enabling intelligent appointment booking, queue management, and clinic discovery for the Moroccan healthcare market.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Access to QueueMed Supabase project

### Installation

```bash
cd mcp-server
npm install
```

### Configuration

1. Copy the environment template:
```bash
cp env.example.txt .env
```

2. Edit `.env` with your credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

### Development

```bash
# Start with hot reload
npm run dev

# Test with MCP Inspector
npm run inspector
```

### Production

```bash
npm run build
npm start
```

## 🛠️ Available Tools

### Clinic Tools

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `clinic_search` | Search for clinics by name, city, specialty | No |
| `clinic_getInfo` | Get detailed clinic information | No |

### Booking Tools

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `booking_getAvailability` | Get available appointment slots | No |

*More tools coming in Phase 2: booking.create, queue.getPosition, patient.getProfile, etc.*

## 📚 Available Resources

| URI | Description |
|-----|-------------|
| `queuemed://policies/emergency` | Emergency contacts for Morocco (SAMU, Police, etc.) |
| `queuemed://policies/privacy` | Data privacy policy |
| `queuemed://policies/disclaimer` | Medical disclaimer |
| `queuemed://schemas/appointment-types` | Available appointment types |
| `queuemed://schemas/specialties` | Medical specialties list |

## 🧪 Testing with MCP Inspector

The MCP Inspector provides a web UI to test your server:

```bash
npm run inspector
```

This will:
1. Start the MCP server
2. Open a browser with the inspector UI
3. Allow you to list and test tools/resources

## 📁 Project Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server configuration
│   ├── config.ts             # Environment configuration
│   ├── tools/                # Tool implementations
│   │   ├── index.ts          # Tool registry
│   │   ├── clinic/           # Clinic tools
│   │   │   ├── search.ts
│   │   │   └── getInfo.ts
│   │   └── booking/          # Booking tools
│   │       └── getAvailability.ts
│   ├── resources/            # Resource definitions
│   │   └── index.ts
│   ├── adapters/             # External service adapters
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── types.ts
│   └── utils/                # Utilities
│       ├── logger.ts
│       └── errors.ts
├── tests/                    # Test files
├── package.json
├── tsconfig.json
└── README.md
```

## 🔒 Security

- Service role key is used for server-side operations
- No PHI is logged (only metadata)
- All tools validate input with Zod schemas
- Rate limiting planned for Phase 4

## 🗺️ Roadmap

- [x] **Phase 1**: Foundation + 3 read-only tools
- [ ] **Phase 2**: Core CRUD tools + authentication
- [ ] **Phase 3**: LLM integration + web search
- [ ] **Phase 4**: Security hardening
- [ ] **Phase 5**: Frontend integration

## 📄 License

MIT

---

*QueueMed - Revolutionizing Moroccan Healthcare 🇲🇦*

