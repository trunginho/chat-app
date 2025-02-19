const WebSocket = require("ws");
const http = require("http");
const nodemailer = require("nodemailer");

// Create a basic HTTP server.
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Node.js Chat Server is Running\n");
});

// Create a WebSocket server attached to the HTTP server.
const wss = new WebSocket.Server({ server });

// Set up the nodemailer transporter.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "trungtran4892@gmail.com",
    pass: "vezq twwk xsrh uasq" // In production, use environment variables for security.
  }
});

const customers = {};
const agents = {};
const messageHistory = {};
const pendingResponses = {};

// Function to send an email when a customer is waiting.
function sendWaitingCustomerEmail(customerId) {
  const mailOptions = {
    from: "trungtran4892@gmail.com",
    to: "trung@epictripasia.com",
    subject: `Customer Waiting for an Agent - ${customerId}`,
    text: `A new customer (${customerId}) has started a chat and is waiting for an agent. Please respond within 2 minutes.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Waiting customer email sent:", info.response);
  });
}

// Function to send an email if no agent responds after 2 minutes.
function sendNoAgentResponseEmail(customerId) {
  const mailOptions = {
    from: "trungtran4892@gmail.com",
    to: "trung@epictripasia.com",
    subject: `No Agent Responded to Customer - ${customerId}`,
    text: `Customer ${customerId} has been waiting for 2 minutes, but no agent responded. You may want to follow up with them.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("No agent response email sent:", info.response);
  });
}

// Store messages for offline agents/customers.
function storeMessage(targetId, fromId, content) {
  if (!messageHistory[targetId]) messageHistory[targetId] = [];
  messageHistory[targetId].push({ from: fromId, content });
}

// Deliver stored messages when a user reconnects.
function deliverStoredMessages(userId, ws) {
  if (messageHistory[userId] && messageHistory[userId].length > 0) {
    messageHistory[userId].forEach(msg => ws.send(JSON.stringify(msg)));
    delete messageHistory[userId];
  }
}

// Start a 2-minute timer and send email when a customer joins.
function startAgentTimeout(customerId, ws) {
  sendWaitingCustomerEmail(customerId); // Send email immediately.

  pendingResponses[customerId] = setTimeout(() => {
    if (customers[customerId]) {
      customers[customerId].send(JSON.stringify({
        from: "system",
        content: "Our agents are not online at the moment. Please leave us your email, and we will contact you as soon as possible."
      }));
      console.log(`Auto-response sent to customer ${customerId}`);
      sendNoAgentResponseEmail(customerId); // Send email after 2 minutes if no agent responded.
    }
  }, 120000); // 2 minutes (120,000 ms)
}

// Handle new WebSocket connections.
wss.on("connection", (ws, req) => {
  console.log("New connection established. Awaiting initialization message...");
  ws.isInitialized = false;
  ws.emailProvided = false;

  ws.on("message", (message) => {
    let rawMessage = message;
    if (Buffer.isBuffer(message)) rawMessage = message.toString("utf8");

    console.log("Received raw message:", rawMessage);

    try {
      const msgData = JSON.parse(rawMessage);

      // Respond to ping messages to support keep-alive.
      if (msgData.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (!ws.isInitialized) {
        if (msgData.type === "init" && msgData.role && msgData.id) {
          ws.role = msgData.role;
          ws.id = msgData.id;
          ws.isInitialized = true;
          console.log(`Initialized connection: role=${ws.role}, id=${ws.id}`);

          if (ws.role === "customer") {
            customers[ws.id] = ws;
            console.log(`Customer connected: ${ws.id}`);
            // If an agent is already connected, notify the customer immediately.
            if (Object.keys(agents).length > 0) {
              ws.send(JSON.stringify({
                from: "system",
                content: "Agent online"
              }));
              console.log(`Notified customer ${ws.id} that an agent is online.`);
            } else {
              // Otherwise, start the 2-minute timer.
              startAgentTimeout(ws.id, ws);
            }
            // Broadcast new customer event to all connected agents.
            Object.keys(agents).forEach(agentId => {
              if (agents[agentId] && agents[agentId].readyState === WebSocket.OPEN) {
                agents[agentId].send(JSON.stringify({
                  type: "new_customer",
                  customerId: ws.id,
                  content: `Customer ${ws.id} connected`
                }));
                console.log(`Broadcasted new customer ${ws.id} to agent ${agentId}`);
              }
            });
          } else if (ws.role === "agent") {
            agents[ws.id] = ws;
            console.log(`Agent connected: ${ws.id}`);
            // When an agent connects, send new_customer events for all waiting customers.
            Object.keys(customers).forEach(customerId => {
              if (customers[customerId] && customers[customerId].readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "new_customer",
                  customerId: customerId,
                  content: `Customer ${customerId} connected`
                }));
                console.log(`Sent new_customer event for customer ${customerId} to agent ${ws.id}`);
              }
            });
            // Stop timers for waiting customers and notify them that an agent is online.
            Object.keys(pendingResponses).forEach(customerId => {
              clearTimeout(pendingResponses[customerId]);
              delete pendingResponses[customerId];
              if (customers[customerId] && customers[customerId].readyState === WebSocket.OPEN) {
                customers[customerId].send(JSON.stringify({
                  from: "system",
                  content: "Agent online"
                }));
                console.log(`Timer stopped for customer ${customerId} as an agent is online.`);
              }
            });
          } else if (ws.role === "keep-alive") {
            console.log("Keep-alive connection established.");
            // No further action is needed for keep-alive connections.
          } else {
            console.error("Unknown role received during initialization:", ws.role);
            ws.send(JSON.stringify({ error: "Unknown role" }));
            ws.close();
            return;
          }

          // Only deliver stored messages for real users.
          if (ws.role !== "keep-alive") {
            deliverStoredMessages(ws.id, ws);
          }
        } else {
          throw new Error("First message must be a valid initialization message");
        }
      } else {
        if (msgData.type === "private" && msgData.target && msgData.content) {
          if (ws.role === "customer") {
            const targetAgentId = msgData.target;
            if (agents[targetAgentId] && agents[targetAgentId].readyState === WebSocket.OPEN) {
              agents[targetAgentId].send(JSON.stringify({
                from: ws.id,
                content: msgData.content
              }));
              console.log(`Message from customer ${ws.id} sent to agent ${targetAgentId}`);
            } else {
              console.log(`Agent ${targetAgentId} not connected.`);
              storeMessage(targetAgentId, ws.id, msgData.content);
            }
          } else if (ws.role === "agent") {
            const targetCustomerId = msgData.target;
            if (customers[targetCustomerId] && customers[targetCustomerId].readyState === WebSocket.OPEN) {
              customers[targetCustomerId].send(JSON.stringify({
                from: ws.id,
                content: msgData.content
              }));
              console.log(`Message from agent ${ws.id} sent to customer ${targetCustomerId}`);
            } else {
              console.log(`Customer ${targetCustomerId} not connected.`);
              storeMessage(targetCustomerId, ws.id, msgData.content);
            }
          }
        } else {
          console.log("Message does not match expected format:", msgData);
        }
      }
    } catch (error) {
      console.error(`Invalid message: ${rawMessage}`);
      ws.send(JSON.stringify({ error: "Invalid message format", details: "All messages must be valid JSON" }));
      ws.close();
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
      } else if (ws.role === "keep-alive") {
        console.log("Keep-alive connection closed.");
      }
    } else {
      console.log("Connection closed before initialization");
    }
  });
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);

  // --- Self Keep-Alive Connection ---
  // This code creates a client (using the same "ws" module) that connects to the server’s
  // WebSocket endpoint. It initializes with a special role ("keep-alive") and then sends
  // periodic ping messages every 5 minutes. If the connection drops, it will try to reconnect.

  // Use the public URL in production to avoid 301 redirects.
  const keepAliveUrl = process.env.NODE_ENV === 'production'
    ? 'wss://epictrip-chat.onrender.com/'
    : `ws://localhost:${port}/`;

  const WebSocketClient = require("ws");
  function keepAliveConnection() {
    const wsClient = new WebSocketClient(keepAliveUrl);

    wsClient.on('open', () => {
      console.log("Keep-alive connection established from server.");
      wsClient.send(JSON.stringify({ type: "init", role: "keep-alive", id: `keep-alive-${Date.now()}` }));
      setInterval(() => {
        if (wsClient.readyState === WebSocketClient.OPEN) {
          wsClient.send(JSON.stringify({ type: "ping" }));
          console.log("Keep-alive ping sent from server client.");
        }
      }, 300000); // 5 minutes (300,000 ms)
    });

    wsClient.on('error', (error) => {
      console.error("Keep-alive connection error:", error);
    });

    wsClient.on('close', () => {
      console.log("Keep-alive connection closed. Reconnecting in 5 seconds...");
      setTimeout(keepAliveConnection, 5000);
    });
  }

  // Start the self keep-alive connection.
  keepAliveConnection();
});
