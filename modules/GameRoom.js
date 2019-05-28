const nanoid = require('nanoid');
const {Tank, TankEnums} = require("./Tank");
const Game = require("./Game");
const EventEmitter = require("events").EventEmitter;
const Peer = require("./ServerPeer");

/**
 * This class matches 2 players, creates a game, and processes the lock-stepping
 * It serves as a game loop and messaging passing between players
 *
 * Each GameRoom can have it's own speed settings and player count
 *
 * At the moment, only the speed can be controlled
 * player count can be greater than 2, but it requires the map to have more than 2 spawn points and at the moment
 * all the maps support only 2 players. We could implement a map supported player count and select a map that
 * supports that many players as the GameRoom requires.
 */

const MAX_FPS = 1000 / 20; // 20fps
module.exports = class GameRoom extends EventEmitter {
	constructor(dbGameModel) {
		super();

		this.id = nanoid(16);
		this.dbGameModel = dbGameModel;

		this.dbGameModel.createSession(this.id);
		this.selectedMap = null;
		this.didSelectMap = false;

		this.game = new Game();
		this.players = [];

		this.availableTankProperties = {};
	}

	/**
	 * Returrns the available tank properties from the Database
	 */
	getTankProperties() {
		return new Promise((resolve) => {
			if (Object.keys(this.availableTankProperties) <= 0) {
				this.dbGameModel.getAvailableTankProperties().then((result) => {
					for (let prop of result) {
						this.availableTankProperties[prop.id] = prop;
					}
					resolve(this.availableTankProperties);
				});
			} else {
				resolve(this.availableTankProperties);
			}
		});
	}

	/**
	 * Prepare the player socket (onMessage and onDisconnect) and push the player in the players array
	 */
	addPlayer(player) {
		// decorate the socket
		player = new Peer(player);
		player.on('message', this.onMessage.bind(this));
		player.on('disconnect', this.onDisconnect.bind(this));
		this.players.push(player);
		return this;
	}

	/**
	 * Here we process the client messages and in case we missed a lockstep (not all players were ready
	 * when the frame fired), we check again if the frame is ready, and send it.
	 *
	 * This means that if one player has "lag", all players have the same lag
	 *
	 * message types:
	 * - get_all_tank_properties -> retrieves and send the player the available tank properties
	 * - game_action -> receive frame input data from the client (untrusted, server validates and responds if ok or not)
	 * - ready ->
	 * 			- each client selects it's tank properties and send them back to the server, notifying it that
	 * 			  it's ready to start the game
	 * 			- the server validates the selected properties:
	 * 				- if they are valid, it waits for all the clients to be ready and starts the game
	 * 				- if the are not valid, it logs an error (desync) and disconnects the clients and closes the room
	 *
	 * - log -> debugging from clients
	 */
	onMessage(player, packet){
		// do stuff
		switch(packet.type){
			case "get_all_tank_properties":
				this.getTankProperties().then((properties) => {
					player.send({
						type: "available_tank_properties",
						data: Object.values(properties)
					});
				});
				break;
			case "game_action":
				this.game.addTankAction(player.tank.id, packet.data);
				break;
			case "log":
				console.log("[room: "+ this.id +"][player: "+ packet.id +"]\n---- ", packet.data);
				break;
			case "ready":
				this.getTankProperties().then((properties) => {
					if(!packet.id){
						this.close();
						console.error("Room desynced. A player with the same id, or without an id joined the room.");
						return;
					}

					// clients have only one slot per property type
					let usedSlots = {};
					let selectedTankProperties = [];
					for(let prop of packet.properties){
						if(!this.availableTankProperties[prop])
						{
							this.close();
							console.error("Room desynced. A player sent invalid tank properties.");
							return;
						}
						if(!usedSlots[this.availableTankProperties[prop].type]) {
							usedSlots[this.availableTankProperties[prop].type] = 1;
							selectedTankProperties.push(this.availableTankProperties[prop]);
						} else {
							this.close();
							console.error("Room desynced. A player selected multiple properties for the same type!");
							return;
						}
					}

					player.tank = new Tank();
					player.tank.id = packet.id;
					this.game.addTank(player.tank);
					player.tank.setProperties(selectedTankProperties);
					this.dbGameModel.addPlayer(this.id, packet.id, packet.properties);

					this.tryStartGame();
				});
				break;
			default:
				throw new Error("Invalid packet! Packet: " + packet);
		}

		if(this.missedLockstep && this.game.isFrameReady()){
			this.sendStep();
		}
	}

	/**
	 * Executed when a player disconnects
	 */
	onDisconnect(){
		console.log("disconnected");
		this.stop();
	}

	/**
	 * Executed when the game is full
	 * This is where the map selection happens
	 */
	onRoomFull(){
		console.log("["+ this.id +"] GameRoom is full! Waiting for all players to be ready and go!");

		this.dbGameModel.getRandomMap().then((result) => {
			if(result){
				// deserialize the map
				this.dbGameModel.updateSession(this.id, {
					map: result.id
				});
				this.game.setMapAndSpawns(JSON.parse(result.map), JSON.parse(result.spawns));
			}
			this.didSelectMap = true;
			this.tryStartGame();
		});
	}

	/**
	 * Helper function that checks if everything is ready, and if it is, it starts the game
	 */
	tryStartGame(){
		if(this.allPlayerReady() && this.didSelectMap){
			this.start();
		}
	}

	/**
	 * This function is executed when the game is full and ready to start
	 * When triggered, we only send the start packet (all other players, except current player)
	 * and an empty game_action which triggers the client AI
	 *
	 * After that, we start the lockstepped game loop
	 */
	start(){
		for(let player of this.players){
			let packet = this.game.prepareGame(player.tank);

			// init the enemies for each player
			player.send({
				type: "start",
				data: packet
			});

			// this starts the game, it basically requests a frame from the clients
			player.send({
				type: "game_action",
				data: false
			});
		}

		this._loop = setInterval(() => {
			if(!this.game.isFrameReady()){
				this.missedLockstep = true;
				return;
			}

			this.sendStep();
		}, MAX_FPS);
	}

	/**
	 * This functions processes the current frame, and sends the players the commands
	 * If the game is finished, we stop the loop
	 */
	sendStep(){
		this.missedLockstep = false;
		let actions = this.game.processFrame();

		for(let player of this.players){
			player.send({
				type: "game_action",
				data: actions
			});
		}

		// check for game end
		if(this.game.finished()){
			this.stop();
		}

		return true;
	}

	/**
	 * This is run when the game ends
	 */
	stop() {
		// set the status to finished
		this.dbGameModel.updateSession(this.id, {
			status: 1
		});

		clearInterval(this._loop);
		this._loop = false;
		this.close();
	}

	/**
	 * Here we set the max players for the rooms.
	 * If the map doesn't have enough spawns for all the players, the server will crash..
	 *
	 * Current maps only support 2 players
	 */
	isFull() {
		return this.players.length >= 2;
	}

	allPlayerReady(){
		// check if all the players have a tank setup
		let allPlayersReady = true;
		for(let p of this.players){
			if(!p.tank){
				allPlayersReady = false;
				break;
			}
		}

		return this.isFull() && allPlayersReady;
	}

	close(){
		for(let player of this.players){
			player.send({
				type: "stop"
			});
			player.close();
		}
		this.players = [];
		this.emit("closed", this);
	}
};