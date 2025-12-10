# Complete Service Layer Architecture - Presentation

## Overview

The Salam Queue Flow application uses a **comprehensive, layered service architecture** following Domain-Driven Design (DDD) principles with clear separation of concerns, repository patterns, and event-driven communication.

---

## Architecture Patterns

### **1. Repository Pattern**
- **Data Access Abstraction**: All services use repositories to abstract database operations
- **Testability**: Easy to mock repositories for unit testing
- **Consistency**: Uniform data access across all services

### **2. Service Layer Pattern**
- **Business Logic**: Services contain business rules and orchestration
- **Transaction Management**: Services coordinate multi-step operations
- **Error Handling**: Centralized error handling with custom error types

### **3. Event-Driven Architecture**
- **Event Bus**: Pub/sub pattern for loose coupling
- **Domain Events**: Services publish events for cross-service communication
- **Decoupling**: Services don't directly depend on each other

### **4. Strategy Pattern**
- **Queue Strategies**: Different queue modes (Slotted, Fluid)
- **Estimation Strategies**: Multiple wait time estimation algorithms
- **Interchangeable**: Easy to swap implementations

---

## Service Catalog

### **🏥 Core Domain Services**

#### **1. Queue Service** (`queue/QueueService.ts`)
**Purpose**: Central orchestration for queue management and scheduling

**Key Responsibilities**:
- Daily schedule management (slotted/fluid modes)
- Patient calling and status management
- Queue position management
- Absent patient handling
- Integration with queue strategies

**Architecture**:
- Uses `QueueRepository` for data access
- Implements `QueueStrategy` pattern (Slotted/Fluid)
- Publishes domain events via `EventBus`
- Integrates with wait time estimation

**Key Methods**:
- `getDailySchedule()` - Fetch schedule for staff/day
- `callNextPatient()` - Call next patient in queue
- `markPatientAbsent()` - Mark patient as absent
- `checkInPatient()` - Patient check-in
- `completeAppointment()` - Complete appointment

**Dependencies**: QueueRepository, QueueStrategy, EventBus, Logger

---

#### **2. Booking Service** (`booking/BookingService.ts`)
**Purpose**: Appointment booking and scheduling

**Key Responsibilities**:
- Appointment creation with validation
- Slot availability checking
- Conflict resolution
- Guest patient handling
- Booking event publishing

**Architecture**:
- Uses `BookingRepository` for data access
- Publishes `BookingCreatedEvent` and `BookingFailedEvent`
- Validates business rules before booking
- Handles walk-in and scheduled appointments

**Key Methods**:
- `bookAppointment()` - Create new appointment
- `getAvailableSlots()` - Get available time slots
- `cancelAppointment()` - Cancel existing appointment

**Dependencies**: BookingRepository, EventBus, Logger

---

#### **3. Clinic Service** (`clinic/ClinicService.ts`)
**Purpose**: Clinic management and configuration

**Key Responsibilities**:
- Clinic CRUD operations
- Settings management
- Working hours configuration
- Subscription management
- Operating mode configuration

**Architecture**:
- Uses `ClinicRepository` for data access
- Manages clinic settings and configuration
- Handles clinic activation/deactivation

**Key Methods**:
- `getClinicByOwner()` - Get clinic by owner ID
- `updateClinicSettings()` - Update clinic configuration
- `getClinicById()` - Retrieve clinic details

**Dependencies**: ClinicRepository, Logger

---

#### **4. Patient Service** (`patient/PatientService.ts`)
**Purpose**: Patient profile management

**Key Responsibilities**:
- Patient CRUD operations
- Guest patient handling
- Patient lookup and creation
- Profile updates
- No-show tracking

**Architecture**:
- Uses `PatientRepository` for data access
- Handles both registered and guest patients
- Manages patient profile data

**Key Methods**:
- `findOrCreatePatient()` - Find or create patient by phone
- `getPatientProfile()` - Get patient details
- `updatePatientProfile()` - Update patient information

**Dependencies**: PatientRepository, Logger

---

#### **5. Staff Service** (`staff/StaffService.ts`)
**Purpose**: Staff member management

**Key Responsibilities**:
- Staff profile management
- Staff-clinic associations
- Role management
- Working hours configuration

**Architecture**:
- Uses `StaffRepository` for data access
- Manages staff-clinic relationships
- Handles staff activation/deactivation

**Key Methods**:
- `getStaffByUser()` - Get staff by user ID
- `getStaffByClinicAndUser()` - Get staff in specific clinic
- `createStaff()` - Create new staff member

**Dependencies**: StaffRepository, Logger

---

### **🤖 AI & Intelligence Services**

#### **6. Chat Service** (`chat/`)
**Purpose**: AI chatbot integration

**Architecture**: Interface-based with Factory Pattern
- `IChatService` interface
- `MockChatService` (development)
- `CugaChatService` (CUGA IBM integration)
- Factory function for service selection

**Key Features**:
- Context-aware messaging
- User role detection
- Environment-based service selection

---

#### **7. Wait Time Estimation Service** (`ml/WaitTimeEstimationService.ts`)
**Purpose**: Predict patient wait times

**Key Responsibilities**:
- Multi-strategy estimation (ML, Rule-based, Historical)
- Fallback chain implementation
- Caching for performance
- Integration with queue disruptions

**Architecture**:
- Strategy pattern with multiple estimators
- `IWaitTimeEstimator` interface
- Implementations:
  - `MlEstimator` - Machine learning predictions
  - `RuleBasedEstimator` - Rule-based calculations
  - `HistoricalAverageEstimator` - Historical averages

**Key Methods**:
- `estimateWaitTime()` - Main estimation method
- Automatic fallback if ML unavailable

**Dependencies**: QueueRepository, ML API Client, AnalyticsRepository

---

#### **8. ML Services** (`ml/`)
**Purpose**: Machine learning integration

**Components**:
- `MlApiClient` - ML API communication
- `MlEstimator` - ML-based wait time estimation
- `DisruptionDetector` - Detect queue disruptions
- `WaitTimeEstimationOrchestrator` - Coordinate estimations

**Architecture**:
- External API integration
- Fallback to rule-based when ML unavailable
- Feature extraction and model inference

---

### **📊 Analytics & Reporting Services**

#### **9. Analytics Repository** (`analytics/repositories/AnalyticsRepository.ts`)
**Purpose**: Historical data and metrics

**Key Responsibilities**:
- Historical wait time metrics
- Appointment statistics
- Performance analytics
- Data aggregation

**Key Methods**:
- `getHistoricalWaitTimeMetrics()` - Historical averages
- Supports filtering by appointment type, time slot

---

### **🔔 Communication Services**

#### **10. Notification Service** (`notification/NotificationService.ts`)
**Purpose**: Multi-channel notifications

**Key Responsibilities**:
- SMS notifications
- Email notifications
- Push notifications
- Notification tracking
- Delivery status management

**Architecture**:
- Multi-channel support
- Status tracking (sent, delivered, failed)
- Retry logic for failed notifications

**Key Methods**:
- `sendNotification()` - Send via any channel
- `getNotificationHistory()` - Retrieve notification logs

---

### **⭐ Feature Services**

#### **11. Rating Service** (`rating/RatingService.ts`)
**Purpose**: Clinic rating and reviews

**Key Responsibilities**:
- Rating submission
- Rating statistics
- User rating retrieval
- Average calculation

**Key Methods**:
- `submitRating()` - Submit new rating
- `getClinicRatingStats()` - Get aggregated stats
- `getUserRating()` - Get user's rating

---

#### **12. Favorite Service** (`favorite/FavoriteService.ts`)
**Purpose**: Patient favorites management

**Key Responsibilities**:
- Add/remove favorites
- Favorite list retrieval
- Favorite status checking

**Key Methods**:
- `toggleFavorite()` - Add/remove favorite
- `getUserFavorites()` - Get user's favorites
- `isFavorited()` - Check favorite status

---

#### **13. Invitation Service** (`invitation/InvitationService.ts`)
**Purpose**: Staff invitation management

**Key Responsibilities**:
- Invitation creation
- Token generation
- Invitation acceptance
- Expiration handling

**Key Methods**:
- `createInvitation()` - Create staff invitation
- `acceptInvitation()` - Accept invitation
- `getInvitationByToken()` - Validate token

---

### **🛠️ Supporting Services**

#### **14. Shared Services** (`shared/`)

**Event Bus** (`events/EventBus.ts`):
- Pub/sub pattern implementation
- Domain event publishing
- Event subscription management
- Event history tracking

**Logger** (`logging/Logger.ts`):
- Structured logging
- Context management
- Log levels (debug, info, warn, error)
- Service-wide logging

**Error Handling** (`errors/`):
- Custom error types:
  - `NotFoundError`
  - `ValidationError`
  - `BusinessRuleError`
  - `ConflictError`
  - `DatabaseError`
  - `ExternalServiceError`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Layer (React)                        │
│  Components, Pages, Hooks                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Queue   │  │ Booking   │  │  Clinic   │  │ Patient  │  │
│  │ Service  │  │ Service   │  │ Service  │  │ Service  │  │
│  └────┬─────┘  └────┬──────┘  └────┬─────┘  └────┬─────┘  │
│       │             │              │             │         │
│  ┌────▼─────┐  ┌────▼──────┐  ┌────▼─────┐  ┌────▼─────┐  │
│  │   ML     │  │Notification│  │ Rating  │  │ Favorite │  │
│  │ Service  │  │  Service   │  │ Service │  │ Service  │  │
│  └────┬─────┘  └────┬──────┘  └────┬─────┘  └────┬─────┘  │
│       │             │              │             │         │
│  ┌────▼─────┐  ┌────▼──────┐  ┌────▼─────┐              │
│  │   Chat   │  │ Analytics │  │Invitation│              │
│  │ Service  │  │ Repository│  │ Service  │              │
│  └────┬─────┘  └────┬──────┘  └────┬─────┘              │
└───────┼─────────────┼──────────────┼──────────────────────┘
        │             │              │
        └─────────────┼──────────────┘
                      │
        ┌─────────────▼─────────────┐
        │    Shared Services        │
        │  • EventBus               │
        │  • Logger                 │
        │  • Error Handling         │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │    Repository Layer       │
        │  • QueueRepository         │
        │  • BookingRepository       │
        │  • ClinicRepository        │
        │  • PatientRepository       │
        │  • StaffRepository         │
        └─────────────┬─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │    Data Layer (Supabase)   │
        │  • PostgreSQL Database     │
        │  • Real-time Subscriptions │
        │  • Row Level Security      │
        └────────────────────────────┘
```

---

## Design Principles

### **1. Separation of Concerns**
- **Services**: Business logic and orchestration
- **Repositories**: Data access abstraction
- **Models**: Data structures and DTOs
- **Events**: Cross-service communication

### **2. Dependency Injection**
- Services accept repositories in constructors
- Easy to mock for testing
- Loose coupling between layers

### **3. Error Handling**
- Custom error types for different scenarios
- Consistent error handling across services
- Proper error propagation

### **4. Event-Driven Communication**
- Services publish domain events
- Other services subscribe to relevant events
- Decoupled service interactions

### **5. Strategy Pattern**
- Queue strategies (Slotted/Fluid)
- Estimation strategies (ML/Rule-based/Historical)
- Easy to add new strategies

---

## Service Communication Patterns

### **Synchronous Communication**
- Direct service method calls
- Used for immediate operations
- Example: `bookingService.bookAppointment()`

### **Asynchronous Communication (Events)**
- Event Bus pub/sub
- Used for side effects and notifications
- Example: `eventBus.publish(BookingCreatedEvent)`

### **Repository Pattern**
- All data access through repositories
- Services never directly access Supabase
- Consistent data access interface

---

## Testing Strategy

### **Unit Testing**
- Mock repositories for service tests
- Test business logic in isolation
- Fast execution

### **Integration Testing**
- Test service-repository integration
- Test event publishing/subscription
- Test error scenarios

### **Service Test Files**
- `QueueService.test.ts`
- `ClinicService.test.ts`
- `PatientService.test.ts`
- `StaffService.test.ts`
- `BookingService.test.ts`

---

## Key Benefits

✅ **Maintainability** - Clear separation of concerns  
✅ **Testability** - Easy to mock and test  
✅ **Scalability** - Services can scale independently  
✅ **Flexibility** - Easy to add new services  
✅ **Consistency** - Uniform patterns across services  
✅ **Type Safety** - Full TypeScript support  
✅ **Error Handling** - Centralized error management  
✅ **Event-Driven** - Loose coupling via events  

---

## Service Dependencies

### **Core Dependencies**
- **Supabase Client**: Database access (via repositories)
- **EventBus**: Cross-service communication
- **Logger**: Structured logging
- **Error Types**: Custom error handling

### **External Dependencies**
- **ML API**: Machine learning predictions
- **SMS/Email Services**: Notification delivery
- **CUGA IBM**: AI chatbot (when integrated)

---

## Summary

A **comprehensive, enterprise-grade service architecture** with:
- **14+ specialized services** covering all domain areas
- **Repository pattern** for data access abstraction
- **Event-driven architecture** for loose coupling
- **Strategy pattern** for flexible algorithms
- **Shared services** for cross-cutting concerns
- **Full TypeScript** support with type safety
- **Comprehensive testing** strategy

The architecture enables **maintainable, testable, and scalable** code while following industry best practices and design patterns.

