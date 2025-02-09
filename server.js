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

wss.on("connection", (ws, req) => {
  console.log("New connection established. Awaiting initialization message...");
  ws.isInitialized = false; // Mark this connection as not yet initialized

  ws.on("message", (message) => {
    // Convert incoming message to a string if it is a Buffer
    let rawMessage = message;
    if (Buffer.isBuffer(message)) {
      rawMessage = message.toString('utf8');
    }
    
    console.log("Received raw message:", rawMessage);

    // If the connection is not yet initialized, expect an "init" message
    if (!ws.isInitialized) {
      let initData;
      try {
        initData = JSON.parse(rawMessage);
      } catch (err) {
        console.error("Failed to parse initialization message:", err);
        ws.send(JSON.stringify({ error: "Initialization message must be valid JSON" }));
        ws.close();
        return;
      }

      if (initData.type === "init" && initData.role && initData.id) {
        // Set the role and id on the WebSocket connection
        ws.role = initData.role;
        ws.id = initData.id;
        ws.isInitialized = true;
        console.log(`Initialized connection: role=${ws.role}, id=${ws.id}`);

        // Store the connection in the appropriate dictionary
        if (ws.role === "customer") {
          customers[ws.id] = ws;
          console.log(`Customer connected: ${ws.id}`);
        } else if (ws.role === "agent") {
          agents[ws.id] = ws;
          console.log(`Agent connected: ${ws.id}`);
        } else {
          console.error("Unknown role received during initialization:", ws.role);
          ws.send(JSON.stringify({ error: "Unknown role" }));
          ws.close();
          return;
        }
      } else {
        console.error("Invalid initialization message format");
        ws.send(JSON.stringify({ error: "Invalid initialization message format" }));
        ws.close();
        return;
      }
    } else {
      // Process subsequent messages (after initialization)
      let data;
      try {
        data = JSON.parse(rawMessage);
      } catch (err) {
        console.error("Invalid message format:", err);
        return;
      }

      // Handle private messages
      if (data.type === "private" && data.target && data.content) {
        if (ws.role === "customer") {
          const targetAgentId = data.target;
          if (agents[targetAgentId] && agents[targetAgentId].readyState === WebSocket.OPEN) {
            agents[targetAgentId].send(JSON.stringify({
              from: ws.id,
              content: data.content
            }));
            console.log(`Message from customer ${ws.id} sent to agent ${targetAgentId}`);
          } else {
            console.log(`Agent ${targetAgentId} not connected.`);
          }
        } else if (ws.role === "agent") {
          const targetCustomerId = data.target;
          if (customers[targetCustomerId] && customers[targetCustomerId].readyState === WebSocket.OPEN) {
            customers[targetCustomerId].send(JSON.stringify({
              from: ws.id,
              content: data.content
            }));
            console.log(`Message from agent ${ws.id} sent to customer ${targetCustomerId}`);
          } else {
            console.log(`Customer ${targetCustomerId} not connected.`);
          }
        }
      } else {
        console.log("Message does not match expected format:", data);
      }
    }
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
