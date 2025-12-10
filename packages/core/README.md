# @queuemed/core

Core business logic for QueueMed healthcare queue management system.

## Overview

This package contains all business logic, services, and repositories that are shared across QueueMed applications:
- Web application
- MCP Server (AI integration)
- REST API (future)

## Architecture

```
@queuemed/core/
├── services/           # Business logic
│   ├── booking/       # Appointment booking
│   ├── queue/         # Queue management
│   ├── patient/       # Patient management
│   ├── clinic/        # Clinic management
│   ├── staff/         # Staff management
│   └── notification/  # Notifications
├── repositories/       # Data access layer
├── models/            # Domain models & types
├── errors/            # Custom error types
└── utils/             # Shared utilities
```

## Usage

```typescript
import { BookingService, QueueService } from '@queuemed/core';

// Services require a Supabase client (dependency injection)
const bookingService = new BookingService(supabaseClient);
const result = await bookingService.bookAppointment(request);
```

## Key Principle

**This package contains NO environment-specific code.**
- No `import.meta.env` (Vite)
- No `process.env` references
- All configuration is passed via dependency injection

This ensures the same business logic works in:
- Browser (web app)
- Node.js (MCP server)
- Edge functions (Supabase)

