/**
 * Import the extensions
 */
require("./utils/extensions");

/**
 * Terminal Setup
 */
const term = require( 'terminal-kit' ).terminal ;
term.grabInput( { mouse: 'button' } ) ;
term.on( 'key' , function( name , matches , data ) {
    if ( name === 'CTRL_C' ) {
		quit();
    }
} ) ;
term.hideCursor();
term.eraseDisplay();

/**
 * Imports
 */
const http = require("http");
const ClientNetworking = require("./modules/ClientNetworking");
const Map = require("./modules/Map");
const {Tank, TankEnums} = require("./modules/Tank");
const TankAI = require("./modules/TankAI");
const nanoid = require("nanoid");

/**
 * Arguments Processing
 * - --panzer => select highest value properties
 * - --t34 => select lowest value properties
 * - --id => PLAYER_ID with a max of 16 chars
 * - --server => server host:port (defaults to 127.0.0.1:8080 - both http and websocket)
 */
const CLIENT_ARGS = require('minimist')(process.argv.slice(2));
const PLAYER_ID = (CLIENT_ARGS.id ? CLIENT_ARGS.id : nanoid(16));
const SERVER = (CLIENT_ARGS.server ? CLIENT_ARGS.server : "127.0.0.1:8080");
const RENDERING_ENABLED = 1;

/**
 * Keeping track of Renderable objects, everything that is renderable comes from the server. Nothing is local
 */
const renderableItems = {};
const enemies = {};
let currentPlayer;


/**
 * Connects to the server
 */
const network = new ClientNetworking("ws://"+ SERVER +"/ws");
network.on("connected", () => {
	/**
	 * Get Tank Properties via websocket
	 */
	// network.send({
	// 	type: "get_all_tank_properties"
	// });

	/**
	 * Get Tank Properties via HTTP Request
	 * Only supports http (no https yet)
	 */

	let req = http.get("http://" + SERVER + "/api/tank_properties/get", function(res) {
		let bodyChunks = [];
		res.on('data', function(chunk) {
			bodyChunks.push(chunk);
		}).on('end', function() {
			let body = Buffer.concat(bodyChunks);
			body = JSON.parse(body);
			if(body.err){
				console.log('ERROR: ' + body.err);
			} else {
				// we emit a network event so that we use the same function for property processing (same as WebSocket)
				network.emit("available_tank_properties", body.result);
			}
		});
	});

	req.on('error', function(e) {
		console.error('ERROR: ' + e.message);
		console.error("Could not retrieve tank properties from server!");
	});
});
/**
 * Processes the available tank properties, and elects for each property type, a single property
 * At the moment, it elects based on "Is Panzer" or "Is T34"
 * - Panzer selects the highest value properties (maximizes damage and health)
 * - T34 selects the lowest value properties (maximizes the movement speed)
 */
network.on("available_tank_properties", (packet) => {
	let properties = {};
	let selectedProperties = [];

	for(let prop of packet){
		if(!properties[prop.type])
			properties[prop.type] = [];
		properties[prop.type].push(prop);
	}
	for(let type in properties){
		// sort properties by lowest value to highest value
		properties[type].sort(
			Array.sortBy(["value"])
		);

		if(CLIENT_ARGS["panzer"]){
			// select highest value properties
			selectedProperties.push(properties[type][properties[type].length - 1].id);
		} else if(CLIENT_ARGS["t34"]){
			// select lowest value properties
			selectedProperties.push(properties[type][0].id);
		} else {
			// select randomly
			let property = properties[type].random();
			selectedProperties.push(property.id);
		}
	}
	global.debug(selectedProperties);
	network.send({
		type: "ready",
		id: PLAYER_ID,
		properties: selectedProperties
	})
});



/**
 * AI Implementation
 */
const ai = new TankAI(CLIENT_ARGS.panzer);

/**
 * The start package contains data about all the opponents (only 1 supported atm)
 */
network.on("start", (packet) => {
	renderableItems["map"] = new Map(term, packet.map);

	renderableItems[packet.player.id] = new Tank(term);
	renderableItems[packet.player.id].setup(packet.player);
	currentPlayer = renderableItems[packet.player.id];

	for(let enemy of packet.enemies){
		renderableItems[enemy.id] = new Tank(term);
		renderableItems[enemy.id].setup(enemy);
		enemies[enemy.id] = renderableItems[enemy.id];
	}

	/**
	 * AI Setup begins here
	 * The AI is all knowing (for simplicity)
	 *
	 * It requires:
	 * - the current map
	 * - the current controllable player
	 * - all the enemies (only one enemy atm)
	 */
	ai
		.setMap(renderableItems["map"])
		.setTank(currentPlayer)
		.setPlayers(enemies)
		.init();
});
/**
 * This is the main game loop received from the server. Each time this is called, the server requests
 * input for a new frame and sends back the current frame input data that needs to be applied and rendered on the client
 */
network.on("game_action", (packet) => {
	// Network Packet processing
	if(packet){
		Object.map(packet, (obj) => {
			if(obj.type == "destroy"){
				delete renderableItems[obj.id];
			} else {
				let bullet = renderableItems[obj.id].applyAction(obj);
				if(bullet){
					renderableItems[bullet.id] = bullet;
				}
			}
		});
	}

	// Rendering
	// term.eraseDisplay();
	Object.map(renderableItems, (value, key) => {
		if(RENDERING_ENABLED)
			value.render();
	});

	term.moveTo(0, 32, "Player ID: " + PLAYER_ID);
	term.moveTo(0, 34, "current hp (green): \t" + (currentPlayer.stats.health + "").padStart(3, " ") + " || " + JSON.stringify(currentPlayer.stats));
	let enemyIndex = 0;
	Object.map(enemies, (enemy) => {
		enemyIndex++;
		term.moveTo(0, 34 + enemyIndex, "enemy hp (red): \t" + (enemy.stats.health + "").padStart(3, " ") + " || " + JSON.stringify(enemy.stats));
	});

	// AI decision (turn)
	let move = ai.getMove();
	network.send({
		type: "game_action",
		data: move
	});
});
/**
 * This packet is received after the game has ended
 *
 * We run the cleanup process here
 */

network.on("stop", (data) => {
	// cleanup, well it's not really needed because the client will close
	// after receiving the stop packet
	for(let i in enemies){
		delete enemies[i];
	}

	let currentPlayerWon = false;
	console.log("\n");
	if(currentPlayer.getHealth() > 0){
		console.log("You won! Congratulations!");
		currentPlayerWon = true;
	} else {
		console.log("You lost! Better luck next time");
		currentPlayerWon = false;
	}
	currentPlayer = false;

	/**
	 * Score update
	 *
	 * This should be handled by the server, because clients are not trusted
	 */
	let req = http.get("http://" + SERVER + "/api/score?id=" + PLAYER_ID + "&score="+ (currentPlayerWon ? 1 : -1), function(res) {
		// ignore response but quit after the request was done
		quit();
	});

	req.on('error', function(e) {
		console.error('ERROR: ' + e.message);
		console.error("Could not update the score!");
		quit();
	});
});

/**
 * This function handles the game exit
 * We need to reset some terminal settings, so we can return the terminal to the original settings
 */
function quit(){
	// term.clear();
	term.hideCursor(false);
	term.styleReset();
	process.exit();
}

/**
 * Sends debug logs to the server
 */
global.debug = function(log){
	network.send({
		id: PLAYER_ID,
		type: "log",
		data: log
	});
};