

// server.js
const WebSocket = require("ws");
const http = require("http");

// Create an HTTP server (for health checks or plain text responses)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Node.js Chat Server is Running\n");
});

// Create the WebSocket server instance
const wss = new WebSocket.Server({ server });

// Dictionaries to store connections after initialization
const customers = {};
const agents = {};

// Add validation for all messages
wss.on("connection", (ws) => {
  let initialized = false;

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      
      if (!initialized) {
        // Handle initialization
        if (message.type === "init") {
          initialized = true;
          // ... your existing init logic ...
        } else {
          throw new Error("First message must be initialization");
        }
      } else {
        // Handle regular messages
        if (message.type === "private") {
          // ... your existing message routing ...
        }
      }
    } catch (error) {
      console.error(`Invalid message: ${raw.toString()}`);
      ws.send(JSON.stringify({
        error: "Invalid message format",
        details: "All messages must be valid JSON"
      }));
      ws.close();
    }
  });
});

  ws.on("close", () => {
    if (ws.isInitialized) {
      if (ws.role === "customer") {
        delete customers[ws.id];
        console.log(`Customer ${ws.id} disconnected`);
      } else if (ws.role === "agent") {
        delete agents[ws.id];
        console.log(`Agent ${ws.id} disconnected`);
      }
    } else {
      console.log("Connection closed before initialization");
    }
  });
});

// Start the HTTP and WebSocket server on the specified port
const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
