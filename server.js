// server.js
const WebSocket = require("ws");
const http = require("http");
const nodemailer = require("nodemailer");

// Configure Nodemailer transporter using Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Function to send email notifications
function sendEmailNotification(customerId, messageContent) {
  const mailOptions = {
    from: process.env.EMAIL_USER,          // Sender address (your email)
    to: process.env.ADMIN_EMAIL,            // Recipient (agent's email)
    subject: `New message from customer ${customerId}`,
    text: `A new message was received from customer ${customerId}:\n\n${messageContent}`,
    html: `<p><strong>Customer:</strong> ${customerId}</p>
           <p><strong>Message:</strong> ${messageContent}</p>`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

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
  let initialized = false;

  ws.on("message", (raw) => {
    const rawMessage = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw.toString();
    console.log("Received raw message:", rawMessage);

    try {
      const message = JSON.parse(rawMessage);

      if (!initialized) {
        // The first message must be an initialization message
        if (message.type === "init" && message.role && message.id) {
          ws.role = message.role;
          ws.id = message.id;
          initialized = true;
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
        if (message.type === "private" && message.target && message.content) {
          if (ws.role === "customer") {
            const targetAgentId = message.target;
            if (agents[targetAgentId] && agents[targetAgentId].readyState === WebSocket.OPEN) {
              // Forward the message to the connected agent
              agents[targetAgentId].send(JSON.stringify({
                from: ws.id,
                content: message.content
              }));
              console.log(`Message from customer ${ws.id} sent to agent ${targetAgentId}`);
            } else {
              console.log(`Agent ${targetAgentId} not connected.`);
              // Send an autoresponse back to the customer indicating the agent is offline
              ws.send(JSON.stringify({
                from: "system",
                content: "Our agents are not online at the moment. Your message has been recorded."
              }));
              // Optionally, send an email notification
              sendEmailNotification(ws.id, message.content);
            }
          } else if (ws.role === "agent") {
            const targetCustomerId = message.target;
            if (customers[targetCustomerId] && customers[targetCustomerId].readyState === WebSocket.OPEN) {
              customers[targetCustomerId].send(JSON.stringify({
                from: ws.id,
                content: message.content
              }));
              console.log(`Message from agent ${ws.id} sent to customer ${targetCustomerId}`);
            } else {
              console.log(`Customer ${targetCustomerId} not connected.`);
            }
          }
        } else {
          console.log("Message does not match expected format:", message);
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
    if (initialized) {
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
