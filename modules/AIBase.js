const TankEnums = require("./Tank").TankEnums;
const PF = require("pathfinding");

/**
 * Actions that can be taken by the AI (should be implemented in addToQueue function)
 */
const Actions = {
	MOVE_UP: "move_up",
	MOVE_DOWN: "move_down",
	MOVE_LEFT: "move_left",
	MOVE_RIGHT: "move_right",
	LOOK_UP: "look_up",
	LOOK_DOWN: "look_down",
	LOOK_LEFT: "look_left",
	LOOK_RIGHT: "look_right",
	MOVE_FORWARD: "move_forward",
	MOVE_BACKWARD: "move_backward",
	SHOOT: "shoot",
	NOOP: "noop"
};

/**
 * Each Action from above, can be a macro for multiple actions
 */
const ActionMacros = {
	[Actions.MOVE_UP]: [Actions.LOOK_UP, Actions.MOVE_FORWARD],
	[Actions.MOVE_DOWN]: [Actions.LOOK_DOWN, Actions.MOVE_FORWARD],
	[Actions.MOVE_LEFT]: [Actions.LOOK_LEFT, Actions.MOVE_FORWARD],
	[Actions.MOVE_RIGHT]: [Actions.LOOK_RIGHT, Actions.MOVE_FORWARD]
};

const OrientationToLookDirection = {
	[TankEnums.Orientation.UP]: Actions.LOOK_UP,
	[TankEnums.Orientation.DOWN]: Actions.LOOK_DOWN,
	[TankEnums.Orientation.LEFT]: Actions.LOOK_LEFT,
	[TankEnums.Orientation.RIGHT]: Actions.LOOK_RIGHT
};

let inputQueue = [];
let actionQueue = [];

/**
 * This class is basically an Input Controller, but beside processing input data into actual game actions,
 * it also knows how to look for enemies (simple radar system), check for collisions and basic pathfinding
 */
class AIBase {
	init() {
		this.pathfinder = new PF.AStarFinder();
	}

	/**
	 * Pathfinding helper
	 *
	 * mapGrid is unusable after running pathfinding on it, so we clone the
	 * original grid and run pathfinding on it
	 */
	findPathTo(x, y){
		let actions = [];
		let tankCenter = this.tank.getCenterPosition();
		let grid = this.mapGrid.clone();

		let path = this.pathfinder.findPath(tankCenter.x, tankCenter.y, x, y, grid);
		let pos = tankCenter;
		for(let part in path){
			if(path[part][0] == pos.x && path[part][1] == pos.y)
				continue;
			if(!path.hasOwnProperty(part))
				continue;

			if(path[part][0] > pos.x){
				actions.push(Actions.MOVE_RIGHT);
				// console.log(pos, path[part], "MOVE_RIGHT");
			} else if(path[part][0] < pos.x){
				actions.push(Actions.MOVE_LEFT);
				// console.log(pos, path[part], "MOVE_LEFT");
			} else if(path[part][1] > pos.y){
				actions.push(Actions.MOVE_DOWN);
				// console.log(pos, path[part], "MOVE_DOWN");
			} else if(path[part][1] < pos.y){
				actions.push(Actions.MOVE_UP);
				// console.log(pos, path[part], "MOVE_UP");
			} else {
				console.log(pos, part, "invalid move");
			}
			pos.x = path[part][0];
			pos.y = path[part][1];

		}

		return actions;
	}

	/**
	 * Sets the map, so we know about it
	 */
	setMap(map) {
		this.map = map;
		this.mapGrid = new PF.Grid(this.map.raw);
		return this;
	}

	/**
	 * Sets the tank that it controls
	 */
	setTank(tank) {
		this.tank = tank;
		return this;
	}

	/**
	 * Sets the other players that are not controlled by the AI
	 */
	setPlayers(players) {
		this.players = Object.values(players);
		return this;
	}

	/**
	 * Get the first enemy player alive (atm we only have 1 enemy)
	 */
	getEnemy(){
		for(let player of this.players){
			if(player.getHealth() > 0)
				return player;
		}

		return false;
	}

	pushBackInQueue(action){
		inputQueue.push(action);
		return {
			type: TankEnums.Actions.noop,
			id: this.tank.id
		};
	}

	/**
	 * Computes the next action based on the given Action.Type, we the push it to the inputQueue
	 * If the action is a macro, we compute each action from the macro, and add it to the queue
	 * If it's not a macro, we just compute the single action and add it to the queue
	 */
	queueAction(type){
		actionQueue.unshift(type);
	}

	/**
	 * Here we pop from the inputQueue and check if the current popped action is a macro,
	 * if it is a macro, we compute it and re-pop from queue.
	 * After a plain action is selected, we add the current tank id and return it
	 */
	processAction(){
		if(inputQueue.length <= 0) {
			let tmp = actionQueue.pop();
			this.processQueuedAction(tmp);
		}


		let input = inputQueue.pop();
		if(input){
			input.id = this.tank.id;
		} else {
			return false;
		}

		return input;
	}

	/**
	 * Here we process an action and convert it to a client side action (something that the Tank class can understand)
	 */
	processQueuedAction(action){
		if(ActionMacros[action]) {
			for (let item of ActionMacros[action]) {
				this.processQueuedAction(item);
			}
			return;
		}

		let input;
		switch (action) {
			case Actions.NOOP:
				input = {
					type: TankEnums.Actions.noop,
					count: 1
				};
				break;
			case Actions.LOOK_UP:
				input = {
					type: TankEnums.Actions.rotate,
					count: 0
				};
				switch (this.tank.orientation) {
					case TankEnums.Orientation.UP:
						break;
					case TankEnums.Orientation.DOWN:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 2;
						break;
					case TankEnums.Orientation.LEFT:
						input.rotation = TankEnums.Rotation.RIGHT;
						input.count = 1;
						break;
					case TankEnums.Orientation.RIGHT:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 1;
						break;
				}
				break;
			case Actions.LOOK_DOWN:
				input = {
					type: TankEnums.Actions.rotate,
					count: 0
				};
				switch (this.tank.orientation) {
					case TankEnums.Orientation.UP:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 2;
						break;
					case TankEnums.Orientation.DOWN:
						break;
					case TankEnums.Orientation.LEFT:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 1;
						break;
					case TankEnums.Orientation.RIGHT:
						input.rotation = TankEnums.Rotation.RIGHT;
						input.count = 1;
						break;
				}
				break;
			case Actions.LOOK_LEFT:
				input = {
					type: TankEnums.Actions.rotate,
					count: 0
				};
				switch (this.tank.orientation) {
					case TankEnums.Orientation.UP:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 1;
						break;
					case TankEnums.Orientation.DOWN:
						input.rotation = TankEnums.Rotation.RIGHT;
						input.count = 1;
						break;
					case TankEnums.Orientation.LEFT:
						break;
					case TankEnums.Orientation.RIGHT:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 2;
						break;
				}
				break;
			case Actions.LOOK_RIGHT:
				input = {
					type: TankEnums.Actions.rotate,
					count: 0
				};
				switch (this.tank.orientation) {
					case TankEnums.Orientation.UP:
						input.rotation = TankEnums.Rotation.RIGHT;
						input.count = 1;
						break;
					case TankEnums.Orientation.DOWN:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 1;
						break;
					case TankEnums.Orientation.LEFT:
						input.rotation = TankEnums.Rotation.LEFT;
						input.count = 2;
						break;
					case TankEnums.Orientation.RIGHT:
						break;
				}
				break;
			case Actions.MOVE_FORWARD:
				input = {
					type: TankEnums.Actions.move,
					direction: TankEnums.Direction.FORWARD,
					count: 1

				};
				break;
			case Actions.MOVE_BACKWARD:
				input = {
					type: TankEnums.Actions.move,
					direction: TankEnums.Direction.BACKWARD,
					count: 1
				};
				break;
			case Actions.SHOOT:
				input = {
					type: TankEnums.Actions.shoot,
					count: 1
				};
				break;
		}

		if(input) {
			input.action = action;
			let count = input.count;
			delete input.count;
			for (let i = 0; i < count; i++) {
				inputQueue.unshift(Object.assign({}, input));
			}
		}
	}

	/**
	 * The collision detection is basic, it generates a collision map (which doesn't contain the ai controlled tank)
	 * and then it checks if there is free space at that position
	 */
	detectCollision(position) {
		let collisionMap = this.generateCollisionMap();

		let tankMapping = this.tank.getMapping();
		for (let y = 0; y < tankMapping.length; y++) {
			for (let x = 0; x < tankMapping[y].length; x++) {
				if(collisionMap[position.y + y] == undefined || collisionMap[position.y + y][position.x + x] == undefined) {
					return true;
				}

				if (collisionMap[position.y + y][position.x + x] != 0) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * check if the enemy is in Line Of Sight
	 */
	isEnemyInLOS(orientation){
		return this.detectEnemiesInLine(orientation);
	}

	/**
	 * Based on a collisionMap, we check for collisions in a line, from the tank position (based on the tank orientation)
	 * The tank can only see in front of him in line equal to it's width
	 */
	detectEnemiesInLine(orientation) {
		let collisionMap = this.generateCollisionMap();
		let tankMapping = this.tank.getMapping();
		let position = this.tank.getCenterPosition();

		while(true) {
			switch (orientation){
				case TankEnums.Orientation.UP:
					position.y--;
					break;
				case TankEnums.Orientation.DOWN:
					position.y++;
					break;
				case TankEnums.Orientation.LEFT:
					position.x--;
					break;
				case TankEnums.Orientation.RIGHT:
					position.x++;
					break;
			}


			for (let y = 0; y < tankMapping.length; y++) {
				for (let x = 0; x < tankMapping[y].length; x++) {
					if (collisionMap[position.y + y] == undefined || collisionMap[position.y + y][position.x + x] == undefined) {
						return false;
					}

					if (collisionMap[position.y + y][position.x + x] != 0 && collisionMap[position.y + y][position.x + x] != 1) {
						return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * This generates the collision map for all tanks, except current AI controlled tank
	 *
	 * Tanks only know about other tanks and not about the bullets they shoot
	 */
	generateCollisionMap() {
		let collisionMap = JSON.parse(JSON.stringify(this.map.raw));
		Object.map(this.players, (tank, id) => {
			let tankMapping = tank.getMapping();
			for (let y = 0; y < tankMapping.length; y++) {
				for (let x = 0; x < tankMapping[y].length; x++) {
					collisionMap[tank.y + y][tank.x + x] = tank.id;
				}
			}
		});

		return collisionMap;
	}

	/**
	 * In case we want to change the strategy, this clears the inputQueue
	 */
	clearActions(){
		inputQueue = [];
		actionQueue = [];
	}

}

module.exports.AIBase = AIBase;
module.exports.Actions = Actions;
module.exports.ActionMacros = ActionMacros;
module.exports.OrientationToLookDirection = OrientationToLookDirection;