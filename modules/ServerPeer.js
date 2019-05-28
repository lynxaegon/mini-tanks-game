const EventEmitter = require("events").EventEmitter;

const Private = {
	socket: Symbol("socket"),
	onMessage: Symbol("onMessage"),
	onConnect: Symbol("onConnect"),
	onDisconnect: Symbol("onDisconnect")
};
/**
 * This is a wraper over the WebSocket object, it simplifies the communication via WebSockets
 */
module.exports = class ClientNetworking extends EventEmitter {
	constructor(socket) {
		super();

		this._connected = true;
		this[Private.socket] = socket;
		this[Private.socket].on('open', this[Private.onConnect].bind(this));
		this[Private.socket].on('message', this[Private.onMessage].bind(this));
		this[Private.socket].on('close', this[Private.onDisconnect].bind(this));
	}

	[Private.onConnect]() {
		this.emit("connect", this);
	}

	[Private.onMessage](packet) {
		packet = JSON.parse(packet);
		if (!packet || !packet.type) {
			throw new Error("Invalid network packet! Packet: " + JSON.stringify(packet));
		}

		this.emit("message", this, packet);
	}

	[Private.onDisconnect]() {
		this.emit("disconnect", this);
		this.close();
	}

	send(data) {
		if (!data || !data.type) {
			throw new Error("Invalid network packet! Packet: " + JSON.stringify(data));
		}
		this[Private.socket].send(JSON.stringify(data));
	}

	close(){
		if(!this._connected) {
			this._connected = false;
			this[Private.socket].close();
		}
	}
};