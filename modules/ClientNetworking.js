const WebSocket = require("ws");
const EventEmitter = require("events").EventEmitter;

const Private = {
	ws: Symbol("ws"),
	onConnect: Symbol("onConnect"),
	onDisconnect: Symbol("onDisconnect"),
	onMessage: Symbol("onMessage")
};
/**
 * WebSocket connection to server, we will use lockstepping so that we have a stable game loop.
 * Each frame we will send the server our action and wait for the server to respond
 * if we can apply the action. This will ensure that all connected clients on the network have sent their
 * action to the server.
 *
 * For simplicity the server packets will be json encoded only
 *
 * Each client packet will be of 2 types:
 * - client status (ready, finished, etc..)
 * - game action (move, rotate, shoot)
 *
 * Each server packet will be of 2 types:
 * - server status (matchmaking, start, finished)
 * - game action (move, rotate, shoot or invalid_action)
 * The server will also add some metadata to the game action (health, damage done, etc..)
 *
 */
module.exports = class ClientNetworking extends EventEmitter {
	constructor(connectionString) {
		super();

		this[Private.ws] = new WebSocket(connectionString);
		this[Private.ws].on('open', this[Private.onConnect].bind(this));
		this[Private.ws].on('message', this[Private.onMessage].bind(this));
		this[Private.ws].on('close', this[Private.onDisconnect].bind(this));
	}

	[Private.onConnect]() {
		this.emit("connected");
	}

	[Private.onMessage](packet) {
		packet = JSON.parse(packet);
		if (!packet || !packet.type) {
			throw new Error("Invalid network packet! Packet: " + JSON.stringify(packet));
		}

		this.emit(packet.type, packet.data);
	}

	[Private.onDisconnect]() {
		this.emit("disconnected");
	}

	send(data) {
		if (!data || !data.type) {
			throw new Error("Invalid network packet! Packet: " + JSON.stringify(data));
		}
		this[Private.ws].send(JSON.stringify(data));
	}
};