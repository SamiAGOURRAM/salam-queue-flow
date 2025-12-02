# --- Stage 1: The Builder (Compiling React) ---
# We use a Node image to compile your TypeScript/React code into HTML/CSS
FROM node:18-alpine AS builder

WORKDIR /app

# 1. Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# 2. Copy the rest of your source code
COPY . .

# 3. Build the app! (Creates the /app/dist folder)
RUN npm run build

# --- Stage 2: The Runner (The Lightweight Server) ---
# We start fresh with a clean image to keep it small
FROM node:18-alpine AS runner

WORKDIR /app

# 1. Install Express (our web server)
RUN npm install express

# 2. Copy the "Built" website from the previous stage
COPY --from=builder /app/dist ./dist

# 3. Copy our custom wrapper script
COPY server.js .

# 4. Open the port
EXPOSE 3000

# 5. Start the engine
CMD ["node", "server.js"]