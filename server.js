const WebSocket = require("ws");
const url = require("url");  // Required for parsing query parameters

const wss = new WebSocket.Server({ port: process.env.PORT || 3001 });

const customers = {};
const agents = {};

wss.on("connection", (ws, req) => {
    // Parse the URL to get query parameters
    const params = url.parse(req.url, true).query;
    const role = params.role;
    const id = params.id;

    console.log(`New connection: role=${role}, id=${id}, url=${req.url}`); // Debugging log

    if (!role || !id) {
        console.log(`Connection with unknown role: ${req.url}`);
        ws.close();  // Close the connection if invalid
        return;
    }

    if (role === "customer") {
        customers[id] = ws;
        console.log(`Customer connected: ${id}`);
    } else if (role === "agent") {
        agents[id] = ws;
        console.log(`Agent connected: ${id}`);
    }

    ws.on("message", (message) => {
        console.log(`Received message from ${id}:`, message);
    });

    ws.on("close", () => {
        console.log(`${id} disconnected`);
        delete customers[id];
        delete agents[id];
    });
});
