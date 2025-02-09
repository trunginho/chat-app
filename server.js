const WebSocket = require("ws");
const http = require("http");
const nodemailer = require("nodemailer");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Node.js Chat Server is Running\n");
});

const wss = new WebSocket.Server({ server });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "trungtran4892@gmail.com",
    pass: "vezq twwk xsrh uasq"
  }
});

function sendEmailNotification(customerId, messageContent) {
  const mailOptions = {
    from: "trungtran4892@gmail.com",
    to: "trung@epictripasia.com",
    subject: `New message from customer ${customerId}`,
    text: `A new message was received from customer ${customerId}:\n\n${messageContent}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error("Error sending email:", error);
    else console.log("Email sent:", info.response);
  });
}

const customers = {};
const agents = {};
const messageHistory = {};
const pendingResponses = {};

function storeMessage(targetId, fromId, content) {
  if (!messageHistory[targetId]) messageHistory[targetId] = [];
  messageHistory[targetId].push({ from: fromId, content });
}

function deliverStoredMessages(userId, ws) {
  if (messageHistory[userId] && messageHistory[userId].length > 0) {
    messageHistory[userId].forEach(msg => ws.send(JSON.stringify(msg)));
    delete messageHistory[userId];
  }
}

function startAgentTimeout(customerId, ws) {
  pendingResponses[customerId] = setTimeout(() => {
    if (customers[customerId]) {
      customers[customerId].send(JSON.stringify({
        from: "system",
        content: "Our agents are not online at the moment. Please leave us your email, and we will contact you as soon as possible."
      }));
      console.log(`Auto-response sent to customer ${customerId}`);
    }
  }, 60000);
}

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

      if (!ws.isInitialized) {
        if (msgData.type === "init" && msgData.role && msgData.id) {
          ws.role = msgData.role;
          ws.id = msgData.id;
          ws.isInitialized = true;

          console.log(`Initialized connection: role=${ws.role}, id=${ws.id}`);
          
          if (ws.role === "customer") {
            customers[ws.id] = ws;
            console.log(`Customer connected: ${ws.id}`);
            startAgentTimeout(ws.id, ws);
          } else if (ws.role === "agent") {
            agents[ws.id] = ws;
            console.log(`Agent connected: ${ws.id}`);
            Object.keys(pendingResponses).forEach(customerId => {
              clearTimeout(pendingResponses[customerId]);
              delete pendingResponses[customerId];
            });
          }

          deliverStoredMessages(ws.id, ws);
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
              sendEmailNotification(ws.id, msgData.content);
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
      }
    } else {
      console.log("Connection closed before initialization");
    }
  });
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
