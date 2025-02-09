// server.js
const WebSocket = require("ws");
const http = require("http");
const nodemailer = require("nodemailer");

// Create an HTTP server (for health checks or plain text responses)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Node.js Chat Server is Running\n");
});

// Create the WebSocket server instance
const wss = new WebSocket.Server({ server });

// Set up NodeMailer transporter using Gmail (replace credentials accordingly)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "trungtran4892@gmail.com",       // Your Gmail address
    pass: "Silenoz2018."           // Your Gmail app password (if using 2FA, generate an app password)
  }
});

// Function to send email notifications
function sendEmailNotification(customerId, messageContent) {
  const mailOptions = {
    from: "trungtran4892@gmail.com",          // Sender address (your email)
    to: "trungtran4892@gmail.com",         // Recipient (your agent's email)
    subject: `New message from customer ${customerId}`,
    text: `A new message was received from customer ${customerId}:\n\n${messageContent}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

// Dictionaries to store connections after initialization
const customers = {};
const agents = {};

wss.on("connection", (ws, req) => {
  console.log("New connection established. Awaiting initialization message...");
  ws.isInitialized = false; // Mark this connection as not yet initialized
  ws.emailProvided = false; // Flag to track if a customer has already provided an email

  ws.on("message", (message) => {
    // Convert incoming message to a string if it is a Buffer
    let rawMessage = message;
    if (Buffer.isBuffer(message)) {
      rawMessage = message.toString("utf8");
    }
    
    console.log("Received raw message:", rawMessage);

    try {
      const msgData = JSON.parse(rawMessage);

      if (!ws.isInitialized) {
        // The first message must be an initialization message
        if (msgData.type === "init" && msgData.role && msgData.id) {
          ws.role = msgData.role;
          ws.id = msgData.id;
          ws.isInitialized = true;
          console.log(`Initialized connection: role=${ws.role}, id=${ws.id}`);

          // Store the connection based on its role
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
          throw new Error("First message must be a valid initialization message");
        }
      } else {
        // Process subsequent messages (after initialization)
        if (msgData.type === "private" && msgData.target && msgData.content) {
          if (ws.role === "customer") {
            const targetAgentId = msgData.target;
            if (agents[targetAgentId] && agents[targetAgentId].readyState === WebSocket.OPEN) {
              // Forward the message to the connected agent
              agents[targetAgentId].send(JSON.stringify({
                from: ws.id,
                content: msgData.content
              }));
              console.log(`Message from customer ${ws.id} sent to agent ${targetAgentId}`);
            } else {
              console.log(`Agent ${targetAgentId} not connected.`);
              // Check if the customer's message contains an "@" (basic email detection)
              if (!ws.emailProvided && msgData.content.includes("@")) {
                ws.emailProvided = true;
                ws.send(JSON.stringify({
                  from: "system",
                  content: "Thank you, we will be in touch as soon as possible."
                }));
                console.log(`Email received from customer ${ws.id}. Sent thank-you response.`);
                // Optionally, you can also send an email notification here
                sendEmailNotification(ws.id, msgData.content);
              } else if (!ws.emailProvided) {
                // Send default autoresponse requesting an email if not provided
                ws.send(JSON.stringify({
                  from: "system",
                  content: "Our agents are not online at the moment. Please leave us your email and we will contact you as soon as possible."
                }));
                console.log(`Sent auto-response to customer ${ws.id} requesting email.`);
                // Also send an email notification so you know about the message
                sendEmailNotification(ws.id, msgData.content);
              }
              // If ws.emailProvided is already true, no further autoresponses are sent.
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
            }
          }
        } else {
          console.log("Message does not match expected format:", msgData);
        }
      }
    } catch (error) {
      console.error(`Invalid message: ${rawMessage}`);
      ws.send(JSON.stringify({
        error: "Invalid message format",
        details: "All messages must be valid JSON"
      }));
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
