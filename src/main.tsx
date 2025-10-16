import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize event handlers
import { initializeQueueEventHandlers } from "./services/queue/handlers/QueueEventHandlers";
initializeQueueEventHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
