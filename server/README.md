# Chatbot Server

This is a Node.js server using the IBM BeeAI Framework (formerly CUGA) to power the application's chatbot.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Configure environment variables:
    - Copy `.env.example` to `.env` (if I created one, but I created `.env` directly).
    - Set `GROQ_API_KEY` in `.env`.

## Running

- Development:
    ```bash
    npm run dev
    ```
- Production:
    ```bash
    npm run build
    npm start
    ```

## API

- `POST /api/chat`
    - Body: `{ "message": "Hello" }`
    - Response: `{ "response": "Hi there!" }`
