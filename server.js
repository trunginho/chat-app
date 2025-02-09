const WebSocket = require('ws');
const url = require('url');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Node.js Chat Server is Running\n');
});

const wss = new WebSocket.Server({ server });

// Dictionaries to store connections
const customers = {};
const agents = {};

wss.on('connection', (ws, req) => {
  const parameters = url.parse(req.url, true).query;
  const role = parameters.role;  // 'customer' or 'agent'
  const id = parameters.id;      // Unique identifier

  if (role === 'customer') {
    customers[id] = ws;
    console.log(`Customer ${id} connected.`);
  } else if (role === 'agent') {
    agents[id] = ws;
    console.log(`Agent ${id} connected.`);
  }

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error('Invalid message format:', err);
      return;
    }

    if (data.type === 'private' && data.target && data.content) {
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
      } else if (role === 'agent') {
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
    }
  });

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

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
