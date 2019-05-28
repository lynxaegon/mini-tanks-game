const sqlite3 = require('sqlite3');
const dbSymbol = Symbol("db");
const dbPath = "./db_files/game_db.sqlite3";
const fs = require("fs");

let initRequired = false;
module.exports = class Database {
	constructor(){
		try {
			// if (!fs.existsSync(dbPath)) {
				fs.closeSync(fs.openSync(dbPath, 'w'));
				initRequired = true;
			// }
			this[dbSymbol] = new sqlite3.Database(dbPath);
		} catch(err) {
			throw new Error("Database failed to open!" + err.message);
		}
	}

	requiresInit(){
		return initRequired;
	}

	/**
	 * Execute a query on the Database and return multiple rows
	 */
	query(query, params){
		return new Promise((resolve, reject) => {
			let callback = (err, result) => {
				if(err){
					reject(err);
					return;
				}

				if(!result || result.length <= 0)
					result = false;
				resolve(result);
			};
			this[dbSymbol].all(query, params, callback);
		});
	}

	/**
	 * Get a single row from the Database
	 */
	get(query, params){
		return new Promise((resolve, reject) => {
			this.query(query, params).then((result) => {
				if(result.length <= 0)
					resolve(false);

				resolve(result[0]);
			}).catch(reject);
		});
	}

	close(){
		this[dbSymbol].close();
	}
};