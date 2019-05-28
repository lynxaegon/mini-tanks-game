const Database = require( "../libs/Database");
const dbSymbol = Symbol("db");
const initDatabase = Symbol("createTable");
const nanoid = require("nanoid");

/**
 * Tank Property types
 */
const TankProperties = {
	CHASSIS: "chassis",
	ARMOR: "armor",
	WEAPON: "weapon"
};

/**
 * This class holds the whole database model for the game.
 * It knows how to create the database (if it doesn't exist)
 * It also knows how to insert/update/get information from the database
 */
module.exports.DBGameModel = class DBGameModel {
	constructor() {
		this[dbSymbol] = new Database();
	}

	init() {
		return new Promise((resolve) => {
			if(this[dbSymbol].requiresInit()) {
				this[initDatabase]().then(() => {
					resolve();
				});
			}
			else {
				resolve();
			}
		});
	}

	/**
	 * Init the database (create tables and default properties)
	 */
	[initDatabase]() {
		let promises = [];
		promises.push(
			this[dbSymbol].query(`
				CREATE TABLE tank_properties (
					id varchar(16) UNIQUE,
					type varchar(32),
					value int
				);
			`).then(() => {
				// TODO: move these outside of the DBGameModel
				let properties = [
					[
						nanoid(16),
						TankProperties.CHASSIS,
						10
					],
					[
						nanoid(16),
						TankProperties.CHASSIS,
						20
					],
					[
						nanoid(16),
						TankProperties.CHASSIS,
						30
					],
					[
						nanoid(16),
						TankProperties.ARMOR,
						0
					],
					[
						nanoid(16),
						TankProperties.ARMOR,
						3
					],
					[
						nanoid(16),
						TankProperties.ARMOR,
						6
					],
					[
						nanoid(16),
						TankProperties.WEAPON,
						10
					],
					[
						nanoid(16),
						TankProperties.WEAPON,
						20
					]
				];
				// add the tank properties
				let promises = [];
				for(let prop of properties){
					promises.push(
						this[dbSymbol].query(`
						INSERT INTO tank_properties (id, type, value)
						VALUES(?, ?, ?)
					`, prop)
					);
				}

				return Promise.all(promises);
			})
		);

		promises.push(
			this[dbSymbol].query(`
				CREATE TABLE maps (
					id varchar(16) UNIQUE,
					map text,
					spawns text
				);
			`).then(() => {
				// Add a default map, so the game is playable

				let map = [];
				let height = 30;
				let width = 60;
				for(let y = 0; y < height; y++){
					for(let x = 0; x < width; x++){
						if(x == 0 || y == 0 || x == width - 1 || y == height - 1){
							if(!map[y])
								map[y] = [];

							map[y][x] = 1;
						} else {
							map[y][x] = 0;
						}
					}
				}

				for(let x = 0; x < width; x++) {
					if(x > 10 && x < 20)
						map[22][x] = 1;

					if(x > 40 && x < 50)
						map[22][x] = 1;

					if(x > 10 && x < 20)
						map[8][x] = 1;

					if(x > 40 && x < 50)
						map[8][x] = 1;
				}

				// Tanks have top anchor positioning
				let spawns = [
					{
						orientation: 180,
						x: 1,
						y: 1
					},
					{
						orientation: 0,
						x: 54,
						y: 26
					}
				];

				this.addOrUpdateMap(null, map, spawns);
			})
		);

		promises.push(
			this[dbSymbol].query(`
				CREATE TABLE game_sessions (
					session_id varchar(16) UNIQUE,
					map text DEFAULT NULL,
					status tinyint(1) DEFAULT 0 
				);
			`)
		);

		promises.push(
			this[dbSymbol].query(`
				CREATE TABLE game_sessions_players (
					session_id varchar(16),
					player_id varchar(16),
					game_data text,
					UNIQUE(session_id, player_id)
				);
			`)
		);

		promises.push(
			this[dbSymbol].query(`
				CREATE TABLE scores (
					player_id varchar(16) UNIQUE,
					wins int DEFAULT 0,
					loses int DEFAULT 0
				);
			`)
		);

		return Promise.all(promises);
	}

	addOrUpdateTankProperties(propertyID, type, value){
		return new Promise((resolve, reject) => {
			let validPropertyTypes = Object.values(TankProperties);
			if(validPropertyTypes.indexOf(type) == -1) {
				reject("Invalid property type");
				return;
			}
			if(value < 0){
				reject("Invalid property value. Value must be >= 0");
				return;
			}
			if(!propertyID){
				propertyID = nanoid(16);
			}

			this[dbSymbol].get(`
				INSERT OR REPLACE
				INTO 
					tank_properties
				(id, type, value)  
				VALUES (?, ?, ?)
			`, [propertyID, type, value])
			.then(resolve)
			.catch(reject);
		});
	}

	addOrUpdateMap(mapID, mapData, spawns){
		return new Promise((resolve, reject) => {
			if(!mapData || !spawns || !Array.isArray(mapData) || !Array.isArray(spawns)) {
				reject("Invalid map provided!s");
				return;
			}
			if(!mapID){
				mapID = nanoid(16);
			}

			let height = mapData.length;
			let width = mapData[0].length;
			for(let y = 0; y < height; y++){
				for(let x = 0; x < width; x++){
					if([0,1].indexOf(mapData[y][x]) == -1) {
						reject("Invalid map provided!");
						return;
					}
				}
			}

			this[dbSymbol].get(`
				INSERT OR REPLACE
				INTO 
					maps
				(id, map, spawns)  
				VALUES (?, ?, ?)
			`, [mapID, JSON.stringify(mapData), JSON.stringify(spawns)])
			.then(resolve)
			.catch(reject);
		});
	}

	/**
	 * Get a random map from the Database
	 *
	 * ** Really inefficient way to get a random map from the Database, but for our purpose it works
	 */
	getRandomMap(){
		return this[dbSymbol].get(`
			SELECT 
				*
			FROM
				maps
		`);
	}

	/**
	 * Returns all available tank properties from which the player can chose
	 */
	getAvailableTankProperties() {
		return this[dbSymbol].query(`
			SELECT 
				*
			FROM
				tank_properties
		`);
	}

	/**
	 * Creates an empty game session with a specific map
	 */
	createSession(sessionID){
		this[dbSymbol].query(`
			SELECT
				*
			FROM
				game_sessions
			WHERE
				session_id = ?
		`, [
			sessionID
		]).then((result) => {
			if(!result){
				this[dbSymbol].query(`
					INSERT INTO game_sessions (session_id)
						VALUES (?)
				`, [
					sessionID
				]);
			}
		});
	}

	/**
	 * Updates a session with new values
	 */
	updateSession(sessionID, fieldsAndValues){
		let updates = [];
		for(let i in fieldsAndValues){
			updates.push(i + " = '"+ fieldsAndValues[i] +"'");
		}
		updates = updates.join(",");

		return this[dbSymbol].query(`
			UPDATE game_sessions SET `+ updates +`
			WHERE
				session_id = ?
		`, [
			sessionID
		]);
	}

	/**
	 * Returns a player from a game session
	 */
	getPlayer(sessionID, playerID){
		return this[dbSymbol].query(`
			SELECT 
				*
			FROM
				game_sessions_players
			WHERE 
				session_id = ? AND
				player_id = ?
				
		`, [
			sessionID,
			playerID
		]);
	}

	/**
	 * Adds a player with it's tank properties to a game session
	 */
	addPlayer(sessionID, playerID, tankProperties){
		this[dbSymbol].query(`
			INSERT INTO game_sessions_players (session_id, player_id, game_data)
				VALUES (?, ?, ?)
		`, [
			sessionID,
			playerID,
			JSON.stringify(tankProperties)
		]);

		this[dbSymbol].query(`
			INSERT OR IGNORE INTO scores (player_id)
				VALUES (?) 
		`, [
			playerID,
		]);
	}

	/**
	 * Returns a session with all it's associated players
	 */
	getSession(sessionID) {
		return this[dbSymbol].query(`
			SELECT 
				*
			FROM
				game_sessions gs
			INNER JOIN
				game_sessions_players gsp
			ON 
				gs.session_id = gsp.session_id
			WHERE 
				gs.session_id = ?
		`, [
			sessionID
		]);
	}

	/**
	 * Positive score means win
	 * Negative score means loss
	 * @param playerID
	 * @param score
	 */
	addScore(playerID, score){
		let scoreColumn;
		if(score < 0){
			scoreColumn = "loses";
			score *= -1;
		} else if(score > 0){
			scoreColumn = "wins";
		} else {
			// ignore draws
			return;
		}

		// don't allow scores greater than 1
		if(score > 1){
			score = 1;
		}

		return this[dbSymbol].query(`
			UPDATE 
				scores 
			SET 
				` + scoreColumn + ` = ?
			WHERE
				player_id = ? 
		`, [
			score,
			playerID
		]);
	}
};
module.exports.TankProperties = TankProperties;