const express = require('express');
const path = require('path');
const os = require('os'); // This library lets us talk to the Operating System

const app = express();
const PORT = 3000;

// --- 1. The Professor's Requirement (Dynamic API) ---
// When you curl this URL, it prints the specific Pod Name.
// This proves that different pods are handling traffic.
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Salam Queue is running!',
        pod_id: os.hostname(), // <--- THE MAGIC LINE
    });
});

// --- 2. The Real App (Static Files) ---
// This tells Node: "If the user asks for 'style.css' or 'logo.png',
// look for it in the 'dist' folder."
app.use(express.static(path.join(__dirname, 'dist')));

// --- 3. React Routing (Catch-All) ---
// If the user goes to /dashboard or /login, send them the main HTML file.
// This lets React Router take over in the browser.
app.get(/.*/, (req, res) => {
            res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}. Pod ID: ${os.hostname()}`);
});