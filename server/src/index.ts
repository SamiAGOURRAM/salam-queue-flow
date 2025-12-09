import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAIChatModel } from 'beeai-framework/adapters/openai/backend/chat';
import { OpenAIClient } from 'beeai-framework/adapters/openai/backend/client';
import { ReActAgent } from 'beeai-framework/agents/react/agent';
import { UnconstrainedMemory } from 'beeai-framework/memory/unconstrainedMemory';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize LLM Backend using OpenAI Compatibility (Standardized)
// We use Groq as the provider, but via the OpenAI interface for better standardization.
const llm = new OpenAIChatModel(
  "llama-3.3-70b-versatile", // Groq model ID
  {},
  new OpenAIClient({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
  })
);

// Initialize Agent
const agent = new ReActAgent({
  llm,
  tools: [], // We will add tools here later
  memory: new UnconstrainedMemory(),
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Run the agent
    const response = await agent.run({
      prompt: message,
    });

    res.json({
      response: response.result.text,
    });
  } catch (error: unknown) {
    console.error('Error processing chat:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
