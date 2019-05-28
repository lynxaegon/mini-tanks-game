/**
 * Import the extensions
 */
require("./utils/extensions");


/**
 * Arguments Processing
 * - --port => server port for http and websockets (defaults to 8080)
 */
const CLIENT_ARGS = require('minimist')(process.argv.slice(2));
const PORT = (CLIENT_ARGS.port ? CLIENT_ARGS.port : 8080);


/**
 * Imports
 */
const WebSocket = require('ws');
const http = require('http');
const HTTPPeer = require('./modules/HTTPPeer');

const httpServer = http.createServer(httpRequest);
const ws = new WebSocket.Server({ server: httpServer });

const GameRoom = require("./modules/GameRoom");
const freeRooms = [];
const activeGameRooms = [];

const DBGameModel = require("./dbModels/DBGameModel").DBGameModel;
const dbGameModel = new DBGameModel();

/**
 * We use websockets for realtime multiplayer, which is lock-stepped based.
 * At each server frame, the players must send their inputs
 * If all the players have sent their input, the server validates them and resends them for being applied on the client
 *
 * this also serves as a simple room based matchmaking system
 */
// wait for the dbModel to be inited (database creation) and then start the http & websocket servers
console.log("Server starting up...");
dbGameModel.init().then(() => {
	ws.on('connection', (ws) => {
		let room;
		if(freeRooms.length <= 0){
			room = new GameRoom(dbGameModel);
			room.on("closed", onRoomClosed);
			freeRooms.push(room);
		} else {
			room = freeRooms[0];
		}

		room.addPlayer(ws);
		if(room.isFull()){
			freeRooms.shift();
			activeGameRooms.push(room);
			room.onRoomFull();
		}
	});

	httpServer.listen(PORT, () => {
		console.log("Listening on", PORT);
	});
});

/**
 * When a room is closed (either the game finished or a player disconnected)
 * We clear the room from the freeRooms (game not finished) and from the activeGameRooms (game finished)
 */
function onRoomClosed(room){
	let idx = freeRooms.indexOf(room);
	if(idx != -1)
		freeRooms.splice(idx, 1);

	idx = activeGameRooms.indexOf(room);
	if(idx != -1)
		activeGameRooms.splice(idx, 1);
}

/**
 * HTTP request processor
 * - This will only return the tank properties and allow you to upload a map
 *
 * Everything here could be done via WebSockets
 */
function httpRequest(req, res){
	let peer = new HTTPPeer(req, res);
	peer.onReady().then(() => {
		let data = {
			err: false,
			result: false
		};


		/**
		 * All API's are GET requests so that i can provide functional links
		 */
		switch(peer.url){
			case "/api/map/update":
				/**
				 * Requires: map and spawns
				 * Optional: id
				 *
				 * if the map doesn't exist, it will create it
				 * if it exists, it will update it
				 */
				if(!peer.query.get.map || !peer.query.get.spawns)
				{
					data.err = "Invalid map provided!";
					peer.json(data);
					return false;
				}

				dbGameModel.addOrUpdateMap(peer.query.get.id, JSON.parse(peer.query.get.map), JSON.parse(peer.query.get.spawns)).then(() => {
					data.result = true;
					peer.json(data);
				}).catch((reason) => {
					peer.status(500);
					data.err = reason;
					data.result = false;
					peer.json(data);
				});
				break;
			case "/api/tank_properties/get":
				/**
				 * Requires: nothing
				 *
				 * returrns all the available tank properties that a player can choose from
				 */
				dbGameModel.getAvailableTankProperties().then((result) => {
					data.result = result;
					peer.json(data);
				}).catch((reason) => {
					peer.status(500);
					data.err = reason;
					peer.json(data);
				});
				break;
			case "/api/tank_properties/update":
				/**
				 * Requires: type and value
				 * Optional: id
				 *
				 * if the tank property doesn't exist, it will create it
				 * if it exists, it will update it
				 */
				dbGameModel.addOrUpdateTankProperties(peer.query.get.id, peer.query.get.type, peer.query.get.value).then(() => {
					data.result = true;
					peer.json(data);
				}).catch((reason) => {
					peer.status(500);
					data.err = reason;
					data.result = false;
					peer.json(data);
				});
				break;
			case "/api/score":
				/**
				 * Requires: id and score (-1 for loss or 1 for win)
				 *
				 * The score update should be made by the server, because clients are not trusted
				 * But for our purpose this will work just fine
				 */
				dbGameModel.addScore(peer.query.get.id, peer.query.get.score).then(() => {
					data.result = true;
					peer.json(data);
				}).catch((reason) => {
					peer.status(500);
					data.err = reason;
					data.result = false;
					peer.json(data);
				});
				break;
			default:
				/**
				 * Funny 404 message
				 */
				peer.status(404);

				// funny 404
				peer.body("o.O apparently you hit a 404");
				peer.body(`
				
				
				
        \`\\.      ,/'	< (Meow)
         |\\\\____//|
         )/_ \`' _\\(
        ,'/-\`__'-\\\`\\
        /. (_><_) ,\\
        \` )/\`--'\\(\`'
          \`      '
				`);
				peer.end();
		}
	})
}