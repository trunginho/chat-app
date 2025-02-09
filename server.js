// server.js
const WebSocket = require("ws");
const http = require("http");
const nodemailer = require("nodemailer");

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Node.js Chat Server is Running\n");
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connections and message history
const customers = {};
const agents = {};

// Email notification function
async function sendEmailNotification(customerId, message) {
  try {
    await transporter.sendMail({
      from: `"Chat Server" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New message from ${customerId}`,
      text: `Customer: ${customerId}\nMessage: ${message}`,
      html: `<p><strong>Customer:</strong> ${customerId}</p>
             <p><strong>Message:</strong> ${message}</p>`
    });
  } catch (error) {
    console.error("Email error:", error);
  }
}

wss.on("connection", (ws) => {
  let initialized = false;
  let customerData = null;

  ws.on("message", async (raw) => {
    const rawMessage = raw.toString();
    
    try {
      const message = JSON.parse(rawMessage);

      if (!initialized) {
        // Initialization handling
        if (message.type === "init") {
          initialized = true;
          
          if (message.role === "customer") {
            customerData = {
              ws,
              messages: [],
              notified: false,
              infoSent: false,
              id: message.id
            };
            customers[message.id] = customerData;
            
          } else if (message.role === "agent") {
            agents[message.id] = ws;
            // Send queued messages to newly connected agent
            Object.values(customers).forEach(customer => {
              if (customer.messages.length > 0) {
                ws.send(JSON.stringify({
                  type: "history",
                  customerId: customer.id,
                  messages: customer.messages
                }));
              }
            });
          }
        }
        return;
      }

      // Handle customer messages
      if (message.type === "private") {
        if (ws.role === "customer") {
          const targetAgent = "agent1"; // Default agent ID

          // Store message in history
          customerData.messages.push({
            content: message.content,
            timestamp: new Date().toISOString(),
            direction: "outgoing"
          });

          // Send email notification
          await sendEmailNotification(customerData.id, message.content);

          // Check for @ in message
          if (message.content.includes("@")) {
            ws.send(JSON.stringify({
              from: "system",
              content: "Thank you. We will be in touch in the next 24h."
            }));
          }

          // Check agent availability
          if (agents[targetAgent]?.readyState === WebSocket.OPEN) {
            agents[targetAgent].send(JSON.stringify({
              customerId: customerData.id,
              content: message.content,
              history: customerData.messages
            }));
          } else {
            // Agent offline handling
            if (!customerData.notified) {
              ws.send(JSON.stringify({
                from: "system",
                content: "Our agents are currently offline. Please leave your email or phone number and we'll contact you."
              }));
              customerData.notified = true;
            }
          }
        }

        // Handle agent messages
        if (ws.role === "agent" && message.customerId) {
          const customer = customers[message.customerId];
          if (customer?.ws.readyState === WebSocket.OPEN) {
            customer.ws.send(JSON.stringify({
              from: "agent",
              content: message.content
            }));
            // Add to message history
            customer.messages.push({
              content: message.content,
              timestamp: new Date().toISOString(),
              direction: "incoming"
            });
          }
        }
      }
    } catch (error) {
      console.error("Message handling error:", error);
    }
  });

  ws.on("close", () => {
    if (customerData) {
      // Keep customer data for 1 hour in case of reconnection
      setTimeout(() => {
        if (customers[customerData.id]?.ws === ws) {
          delete customers[customerData.id];
        }
      }, 3600000);
    }
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log(`Server listening on port ${process.env.PORT || 3001}`);
});
