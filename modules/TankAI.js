const {AIBase, Actions, ActionMacros, OrientationToLookDirection} = require("./AIBase");
const TankEnums = require("./Tank").TankEnums;


module.exports = class TankAI extends AIBase {
	/**
	 * The AI requires the map (it's all knowing) and the tank that it should control
	 * The action counter is used to know how many actions have passed since the beginning of the AI
	 */
	constructor() {
		super();
		this.actionCount = 0;
		this.lastEnemySighting = -1;
		this.collisionDetected = false;
	}

	/**
	 * This is the main entrypoint for the TankAI class
	 * Each turn, the AI computes a move and returns it so that we can pass it to the networking stack
	 */

	/**
	 * For easier gameplay, the tank has a 50% chance of shooting when using the "radar"
	 * and a 100% chance of shooting if it's directly looking at it
	 */
	getMove() {
		let move;
		let shootChance = 50;

		if(this.tank.canShoot() && !this.queuedShoot){
			for(let i in TankEnums.Orientation) {
				if (this.isEnemyInLOS(TankEnums.Orientation[i])) {
					if(TankEnums.Orientation[i] == this.tank.orientation){
						shootChance = 100;
					}
					if(Number.random(0, 100) <= shootChance) {
						this.lastEnemySighting = this.actionCount;
						this.clearActions();
						this.queueAction(OrientationToLookDirection[TankEnums.Orientation[i]]);
						this.queueAction(Actions.SHOOT);
						this.queuedShoot = true;
					}
					break;
				}
			}
		}

		move = this.processAction();
		if(!move) {
			let nextNavPosition = this.getNextNavPosition();
			global.debug("nav to " + JSON.stringify(nextNavPosition));
			let actions = this.findPathTo(nextNavPosition.x, nextNavPosition.y);
			for(let action of actions){
				this.queueAction(action);
			}
			move = this.processAction();
		}
		if(move){
			if(move.type == TankEnums.Actions.shoot){
				// after shooting, reset the variable for queued shooting
				this.queuedShoot = false;
			}
			else if(move.type == TankEnums.Actions.move) {
				if (this.tank.hasCooldown(TankEnums.Actions.move)) {
					move = this.pushBackInQueue(move);
				}

				if (this.detectCollision(this.tank.getFuturePosition(move))) {
					this.clearActions();
					this.collisionDetected = true;
					return this.getMove();
				}
			}
		}

		// when no more moves
		if(!move){
			this.queueAction(Actions.NOOP);
			move = this.processAction();
		}

		this.collisionDetected = false;
		this.actionCount++;
		return move;
	}

	/**
	 * Attack & Defend
	 * Strategies go here
	 *
	 * Our AI has 3 strategies:
	 * 1. Random position until enemy is sighted
	 * 2. Go near the enemy if the last sighting was at least 30 frames ago
	 * 3. Run away from the enemy if the tank just shot at him
	 *
	 * So logically:
	 * 	- move randomly on the map and find the enemy, after the enemy was found shoot and then run away from him
	 * 	- after the tank has gone far enough from the enemy, go back to the enemy and try shooting him again
	 */
	getNextNavPosition(){
		let tankCenter = this.tank.getCenter();
		// default position is random
		let position = {
			x: Number.random(tankCenter.x + 1, this.map.width - 1 - tankCenter.x),
			y: Number.random(tankCenter.y + 1, this.map.height - 1 - tankCenter.y)
		};

		// if last move finished with a collision, go to a random point
		if(this.collisionDetected){
			global.debug("collision detected");
			return position;
		}

		let framesSinceLastSighting = this.actionCount - this.lastEnemySighting;

		// we haven't found the enemy yet (radar)
		if(this.lastEnemySighting == -1)
			return position;

		let enemy = this.getEnemy();
		if(!enemy){
			return position;
		}
		let enemyPosition = enemy.getCenterPosition();

		/**
		 * Non Random strategies
		 */
		if(framesSinceLastSighting > 30){
			position.x = enemyPosition.x;
			position.y = enemyPosition.y;
		} else if(framesSinceLastSighting < 1) {
			let x = Number.random(5, 15);
			let y = Number.random(5, 15);
			// 50% chance to add or subtract from enemy position
			if(Number.random(0, 100) < 50){
				x *= -1;
			}
			if(Number.random(0, 100) < 50){
				y *= -1;
			}

			position.x = enemyPosition.x + x;
			position.y = enemyPosition.y + y;
			position.y = -1;

			// if out of bounds, randomize
			if(!Number.between(position.x, tankCenter.x + 1, this.map.width - 1 - tankCenter.x)){
				position.x = Number.random(tankCenter.x + 1, this.map.width - 1 - tankCenter.x);
			}
			if(!Number.between(position.y, tankCenter.y + 1, this.map.height - 1 - tankCenter.y)){
				position.y = Number.random(tankCenter.y + 1, this.map.height - 1 - tankCenter.y);
			}
		}

		return position;
	}
};