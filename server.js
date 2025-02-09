// server.js
const WebSocket = require('ws');
const url = require('url');
const http = require('http');

// Create an HTTP server (this can be used to verify the server is up)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Node.js Chat Server is Running\n');
});

// Initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });

// Dictionaries to store active connections
const customers = {};
const agents = {};

wss.on('connection', (ws, req) => {
  // Parse query parameters from the connection URL (e.g., ?role=customer&id=customer1)
  const parameters = url.parse(req.url, true).query;
  const role = parameters.role; // Expected values: 'customer' or 'agent'
  const id = parameters.id;     // Unique identifier for the client

  // Log connection details
  console.log(`New connection: role=${role}, id=${id}, url=${req.url}`);

  // Store the connection based on the role
  if (role === 'customer') {
    customers[id] = ws;
    console.log(`Customer ${id} connected.`);
  } else if (role === 'agent') {
    agents[id] = ws;
    console.log(`Agent ${id} connected.`);
  } else {
    console.log("Connection with unknown role:", req.url);
  }

  // Listen for incoming messages
  ws.on('message', (message) => {
    // Log the raw message before parsing
    console.log("Received raw message:", message);

    let data;
    try {
      // Attempt to parse the message as JSON
      data = JSON.parse(message);
    } catch (err) {
      console.error("Invalid message format:", err);
      // You can also send an error back to the client if desired:
      // ws.send(JSON.stringify({ error: "Invalid JSON format" }));
      return;
    }

    // Check that the message follows the expected private message format
    if (data.type === 'private' && data.target && data.content) {
      // If the sender is a customer, route the message to the target agent
      if (role === 'customer') {
        const targetAgentId = data.target;
        if (agents[targetAgentId] && agents[targetAgentId].readyState === WebSocket.OPEN) {
          agents[targetAgentId].send(JSON.stringify({
            from: id,
            content: data.content
          }));
          console.log(`Message from customer ${id} sent to agent ${targetAgentId}`);
        } else {
          console.log(`Agent ${targetAgentId} not connected.`);
        }
      }
      // If the sender is an agent, route the message to the target customer
      else if (role === 'agent') {
        const targetCustomerId = data.target;
        if (customers[targetCustomerId] && customers[targetCustomerId].readyState === WebSocket.OPEN) {
          customers[targetCustomerId].send(JSON.stringify({
            from: id,
            content: data.content
          }));
          console.log(`Message from agent ${id} sent to customer ${targetCustomerId}`);
        } else {
          console.log(`Customer ${targetCustomerId} not connected.`);
        }
      }
    } else {
      console.log("Message does not match the expected private message format:", data);
    }
  });

  // Handle connection close
  ws.on('close', () => {
    if (role === 'customer') {
      delete customers[id];
      console.log(`Customer ${id} disconnected.`);
    } else if (role === 'agent') {
      delete agents[id];
      console.log(`Agent ${id} disconnected.`);
    }
  });
});

// Start the server
const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
