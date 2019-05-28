const nanoid = require("nanoid");
const Map = require("./Map");
const {Tank, TankEnums} = require("./Tank");


/**
 * This class is the Main Game (server side). It receives data frame input data via the GameRoom,
 * processes the input data, checks for collisions, applies damage, creates bullets and knows when the Game ended.
 *
 * Everything is processed here but sent back to the GameRoom to relay the data to each playerss
 */
module.exports = class Game {
	constructor(){
		this.frame = 0;
		this.tanks = {};
		this.bullets = {};

		this.currentTankActions = {};
	}

	/**
	 * Sets the map and spawn points that will be used for the current game
	 */
	setMapAndSpawns(map, spawns){
		this.map = new Map(null, map, spawns);
	}

	/**
	 * Adds a tank to the game
	 */
	addTank(tank) {
		this.tanks[tank.id] = tank;
	}

	/**
	 * Adds a tank frame action, that should be validated and applied on next server frame
	 */
	addTankAction(id, action){
		this.currentTankActions[id] = action;
	}

	/**
	 * Checks if all the players have sent their requested input
	 */
	isFrameReady(){
		return Object.keys(this.currentTankActions).length == Object.keys(this.tanks).length;
	}

	/**
	 * Prepares the start package
	 * This contains the current player, the enemies and the elected map
	 */
	prepareGame(tank){
		let packet = {
			player: {},
			enemies: [],
			map: false
		};
		let spawnIndex = 0;
		Object.map(this.tanks, (enemy, id) => {
			if(tank.id == id){
				packet.player = this.getPlayerData(spawnIndex, id, false);
			} else {
				packet.enemies.push(
					this.getPlayerData(spawnIndex, id, true)
				);
			}
			spawnIndex++;
		});
		packet.map = this.map.raw;

		return packet;
	}

	/**
	 * Retrieves the player data that needs to be sent to the client to init it's tank.
	 * It sends everything the client should know about it's tank or enemy tanks.
	 */
	getPlayerData(spawnIndex, tankID, isEnemy) {
		let initData = this.map.getSpawnLocation(spawnIndex);
		initData.id = tankID;
		this.tanks[tankID].setup(initData);

		return {
			id: tankID,
			orientation: this.tanks[tankID].orientation,
			enemy: isEnemy,
			x: this.tanks[tankID].x,
			y: this.tanks[tankID].y,
			stats: this.tanks[tankID].stats,
			cooldowns: this.tanks[tankID].getDefaultCooldowns()
		};
	}

	/**
	 * Processes and validates the next frame based on the requested input and bullet updates
	 *
	 * 1. Applies requested tank actions
	 * 2. Checks for collisions, if any it reverts the action
	 * 3. Applies bullet actions (server side only)
	 * 4. Checks for bullet collisions, if any it destroys the bullet and applies damage if needed
	 */
	processFrame(){
		let bulletActions = {};
		// collision map before moving
		this.applyTankActions();
		Object.map(this.tanks, (tank, id) => {
			let collisionMap = this.generateCollisionMap(id, false);
			let didCollide = this.checkTankCollisions(tank, collisionMap);

			if(didCollide) {
				this.tanks[id].revertAction(this.currentTankActions[id]);
				delete this.currentTankActions[id];
			}
		});

		// update collision map
		bulletActions = this.applyBulletActions();
		Object.map(this.bullets, (bullet, id) => {
			// bullet can be destroyed by another bullet
			if(!bullet)
				return;

			let collisionMap = this.generateCollisionMap(id, true);
			let collision = this.checkBulletCollisions(bullet, collisionMap);

			if(collision) {
				if(this.tanks[collision]) {
					let damage = this.tanks[bullet.tankID].stats.damage;
					this.tanks[collision].takeDamage(damage);
					this.currentTankActions[collision].health = this.tanks[collision].stats.health;
				}

				if(this.bullets[collision]) {
					bulletActions[collision] = {
						type: "destroy",
						id: collision
					};
					delete this.bullets[collision];
				}
				bulletActions[id] = {
					type: "destroy",
					id: id
				};

				delete this.bullets[id];
			}
		});

		let actions = Object.values(this.currentTankActions);
		for(let bulletAction of Object.values(bulletActions)) {
			actions.push(bulletAction);
		}

		// Show some debug output in the server console, but ignore spamming (noop actions)
		this.frame++;
		// console.log("----- Frame: "+ this.frame +" ---------");
		// for(let action of actions){
		// 	if(action.type != "noop")
		// 		console.log(action);
		// }

		this.currentTankActions = {};
		return actions;
	}

	/**
	 * Loops through all the tanks and checks if they can apply the requested action
	 */
	applyTankActions(){
		let action;
		Object.map(this.tanks, (tank, id) => {
			if(tank.hasCooldown(this.currentTankActions[id].type)){
				this.currentTankActions[id] = {
					type: TankEnums.Actions.noop,
					id: id
				};
			}

			action = this.currentTankActions[id];
			if(action.type == TankEnums.Actions.shoot){
				action.bulletID = nanoid(6);
			}

			let bullet = tank.applyAction(action);
			if(bullet){
				if(Number.between(bullet.x, 0, this.map.width - 1) && Number.between(bullet.y, 0, this.map.height - 1)) {
					this.bullets[bullet.id] = bullet;
				} else {
					delete this.currentTankActions[id];
				}
			}
		});
	}

	/**
	 * Checks the collisions for a specific tank
	 */
	checkTankCollisions(tank, collisionMap){
		let tankMapping = tank.getMapping();
		for (let y = 0; y < tankMapping.length; y++) {
			for (let x = 0; x < tankMapping[y].length; x++) {
				if(collisionMap[tank.y + y][tank.x + x] != 0){
					return collisionMap[tank.y + y][tank.x + x];
				}
			}
		}

		return false;
	}

	/**
	 * Generates a collision map for a renderable object and ignores the currently checked object from the map
	 * withBullets is required for bullets, tanks ignore collision checking with bullets, they only see other tanks
	 */
	generateCollisionMap(ignoreId, withBullets){
		let collisionMap = JSON.parse(JSON.stringify(this.map.raw));
		Object.map(this.tanks, (tank, id) => {
			if(id == ignoreId)
				return;

			let tankMapping = tank.getMapping();
			for (let y = 0; y < tankMapping.length; y++) {
				for (let x = 0; x < tankMapping[y].length; x++) {
					collisionMap[tank.y + y][tank.x + x] = tank.id;
				}
			}
		});

		if(withBullets) {
			Object.map(this.bullets, (bullet, id) => {
				if(id == ignoreId)
					return;

				// add the current bullet location + the previous one, in case 2 bullets collide
				let bulletMapping = bullet.getMapping();
				for (let y = 0; y < bulletMapping.length; y++) {
					for (let x = 0; x < bulletMapping[y].length; x++) {
						collisionMap[bullet.y + y][bullet.x + x] = bullet.id;
					}
				}

				var prevPosition = bullet.getPreviousPosition();
				for (let y = 0; y < bulletMapping.length; y++) {
					for (let x = 0; x < bulletMapping[y].length; x++) {
						collisionMap[prevPosition.y + y][prevPosition.x + x] = bullet.id;
					}
				}
			});
		}

		return collisionMap;
	}

	/**
	 * Applies bullets movement
	 */
	applyBulletActions(){
		let actions = {};
		Object.map(this.bullets, (bullet, id) => {
			bullet.move(1);
			actions[id] = {
				id: id,
				speed: 1
			};
		});

		return actions;
	}

	/**
	 * Check collisions for bullets
	 */
	checkBulletCollisions(bullet, collisionMap){
		let bulletMapping = bullet.getMapping();
		for (let y = 0; y < bulletMapping.length; y++) {
			for (let x = 0; x < bulletMapping[y].length; x++) {
				if(collisionMap[bullet.y + y][bullet.x + x] != 0){
					return collisionMap[bullet.y + y][bullet.x + x];
				}
			}
		}

		return false;
	}

	/**
	 * Checks if the other tank has died (only 2 players are supported in the game class, but the game room supports more)
	 * @return {boolean}
	 */
	finished(){
		let finished = false;
		Object.map(this.tanks, (tank, id) => {
			if(tank.stats.health <= 0)
				finished = true;
		});

		return finished;
	}

}