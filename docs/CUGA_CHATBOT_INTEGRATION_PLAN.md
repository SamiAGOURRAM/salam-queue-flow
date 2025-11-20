# CUGA IBM Chatbot Integration Plan

## Overview
This document outlines the plan to integrate CUGA (ConfigUrable Generalist Agent) IBM chatbot into the Salam Queue Flow application as a floating chat widget.

## Research Findings

### About CUGA
- **Full Name**: ConfigUrable Generalist Agent
- **Developer**: IBM Research
- **Type**: Open-source AI agent framework
- **Capabilities**:
  - Multi-tool integration
  - Composable architecture
  - Configurable reasoning modes
  - Handles complex tasks across web and API environments
  - Enterprise guarantees (safety, trustworthiness, cost/latency optimization)

### Current Status
- CUGA is mentioned in IBM Research publications
- Exact GitHub repository URL needs verification
- May be available through IBM Cloud services or as a separate package

## Integration Architecture

### Phase 1: UI Component (Frontend)
**Status**: Ready to implement

1. **Floating Chat Button Component**
   - Location: Bottom right corner
   - Fixed position, always visible
   - Icon: Chat/Message icon from lucide-react
   - Animation: Pulse/breathing effect when new messages available
   - Z-index: High (above other content)

2. **Chat Window Component**
   - Slide-up animation from bottom right
   - Responsive design (mobile-friendly)
   - Features:
     - Message history
     - Input field
     - Send button
     - Minimize/maximize
     - Close button
   - Styling: Matches app theme (Tailwind CSS)

### Phase 2: Service Layer (Backend Integration)
**Status**: Architecture design

1. **Chat Service** (`src/services/chat/ChatService.ts`)
   - Abstract interface for chatbot communication
   - Methods:
     - `sendMessage(message: string, context?: ChatContext): Promise<ChatResponse>`
     - `getHistory(): Promise<ChatMessage[]>`
     - `clearHistory(): Promise<void>`

2. **CUGA Service Implementation** (`src/services/chat/CugaChatService.ts`)
   - Implements ChatService interface
   - Handles CUGA-specific API calls
   - Manages authentication/API keys
   - Error handling and retry logic

3. **Chat Context Provider** (`src/contexts/ChatContext.tsx`)
   - React context for chat state management
   - Manages:
     - Chat history
     - Connection status
     - Loading states
     - Error states

### Phase 3: Backend API (If Needed)
**Status**: TBD based on CUGA integration method

**Option A: Direct Frontend Integration**
- CUGA provides JavaScript/TypeScript SDK
- Direct API calls from frontend
- Requires API key management

**Option B: Backend Proxy**
- Create Express/FastAPI backend endpoint
- Frontend → Backend → CUGA API
- Better security (API keys on server)
- Can add caching, rate limiting

### Phase 4: CUGA-Specific Configuration
**Status**: Pending CUGA repository access

1. **Installation**
   ```bash
   # TBD - depends on CUGA package format
   npm install @ibm/cuga-agent
   # OR
   pip install cuga-agent
   ```

2. **Configuration**
   - API endpoint URL
   - API keys (environment variables)
   - Agent configuration
   - Tool integrations (if needed)

3. **Context Setup**
   - Clinic/patient context
   - User role (clinic owner, staff, patient)
   - Current page/route context
   - Queue/appointment data (if relevant)

## Implementation Steps

### Step 1: Create UI Components ✅ Ready
- [x] Create `ChatWidget.tsx` - Floating button component
- [x] Create `ChatWindow.tsx` - Chat interface component
- [x] Add to App.tsx (global component)

### Step 2: Create Service Layer
- [ ] Create `ChatService` interface
- [ ] Create `CugaChatService` implementation
- [ ] Create mock service for development/testing

### Step 3: Integrate CUGA
- [ ] Research CUGA installation method
- [ ] Install CUGA package/SDK
- [ ] Configure CUGA with API keys
- [ ] Test basic message sending

### Step 4: Add Context & State Management
- [ ] Create ChatContext
- [ ] Integrate with React Query (if needed)
- [ ] Add message persistence (localStorage/backend)

### Step 5: Enhancements
- [ ] Add typing indicators
- [ ] Add message timestamps
- [ ] Add file upload (if supported)
- [ ] Add voice input (optional)
- [ ] Add conversation history persistence

## File Structure

```
src/
├── components/
│   └── chat/
│       ├── ChatWidget.tsx          # Floating button
│       ├── ChatWindow.tsx          # Chat interface
│       ├── MessageList.tsx         # Message display
│       ├── MessageInput.tsx        # Input field
│       └── MessageBubble.tsx      # Individual message
├── services/
│   └── chat/
│       ├── ChatService.ts          # Interface
│       ├── CugaChatService.ts      # CUGA implementation
│       └── MockChatService.ts      # For development
├── contexts/
│   └── ChatContext.tsx            # React context
└── hooks/
    └── useChat.ts                  # Custom hook
```

## Environment Variables

```env
# CUGA Configuration
VITE_CUGA_API_URL=https://api.cuga.ibm.com
VITE_CUGA_API_KEY=your_api_key_here
VITE_CUGA_AGENT_ID=your_agent_id
VITE_CUGA_ENABLED=true
```

## Security Considerations

1. **API Key Management**
   - Never expose API keys in frontend code
   - Use environment variables
   - Consider backend proxy for production

2. **Data Privacy**
   - Don't send sensitive patient data to CUGA
   - Sanitize user inputs
   - Comply with healthcare data regulations (HIPAA, etc.)

3. **Rate Limiting**
   - Implement rate limiting on frontend
   - Backend should enforce rate limits

## Testing Strategy

1. **Unit Tests**
   - ChatService methods
   - Message formatting
   - Error handling

2. **Integration Tests**
   - CUGA API communication
   - Message flow
   - Context passing

3. **E2E Tests**
   - User opens chat
   - Sends message
   - Receives response
   - Closes chat

## Next Steps

1. **Immediate**: Create UI components (can be done now)
2. **Short-term**: Research CUGA GitHub repository and installation
3. **Medium-term**: Implement service layer and CUGA integration
4. **Long-term**: Add enhancements and optimizations

## Alternative Options (If CUGA Not Available)

If CUGA repository is not accessible, consider:
1. **IBM Watson Assistant** - Official IBM chatbot service
2. **OpenAI GPT** - Via API
3. **Anthropic Claude** - Via API
4. **Custom LLM** - Self-hosted solution

## Resources

- IBM Research CUGA Blog: https://research.ibm.com/blog/cuga-agent-framework
- CUGA GitHub: TBD (needs verification)
- IBM Cloud Documentation: https://cloud.ibm.com/docs

