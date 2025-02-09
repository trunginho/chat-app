// server.js
const http = require('http');
const WebSocket = require('ws');

// Create a basic HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('WebSocket chat server running.\n');
});

// Initialize the WebSocket server instance on the HTTP server
const wss = new WebSocket.Server({ server });

// Listen for client connections
wss.on('connection', (ws) => {
    console.log('A new client connected!');
    
    // Send a welcome message to the client
    ws.send('Welcome to the chat!');

    // Listen for messages from the client
    ws.on('message', (message) => {
        console.log(`Received: ${message}`);

        // Broadcast the message to all connected clients (except the sender)
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });
});

// Start the server on port 8080
server.listen(8080, () => {
    console.log('Server is listening on port 8080');
});
