const Renderer = require("./Renderer");
const {Bullet, BulletEnums} = require("./Bullet");
const TankProperties = require("../dbModels/DBGameModel").TankProperties;
/**
 * Allowed Tank Orientations
 */
const Orientation = {
	UP: 0,
	DOWN: 180,
	LEFT: 270,
	RIGHT: 90
};

/**
 * Allowed Tank Rotations
 */
const Rotation = {
	LEFT: -90,
	RIGHT: 90,
};

/**
 * Allowed Tank Directions
 */
const Direction = {
	FORWARD: 1,
	BACKWARD: -1
};

/**
 * Serves as private functions in the class, that will be executed from applyAction
 */
const PrivateActions = {
	rotate: Symbol("rotate"),
	move: Symbol("move"),
	shoot: Symbol("shoot"),
	noop: Symbol("noop")
};

/**
 * Allowed Tank Actions (per turn)
 */
const Actions = Object.map(PrivateActions, function (val, key) {
	return key;
});

/**
 * Orientation to tank Mapping
 */
const TankMapping = {
	[Orientation.UP]: [
		[" ", " ", "o", " ", " "],
		["o", " ", "o", " ", "o"],
		["o", " ", "o", " ", "o"],
	],
	[Orientation.DOWN]: [
		["o", " ", "o", " ", "o"],
		["o", " ", "o", " ", "o"],
		[" ", " ", "o", " ", " "]
	],
	[Orientation.LEFT]: [
		[" ", " ", "o", " ", "o"],
		["o", " ", "o", " ", "o"],
		[" ", " ", "o", " ", "o"]
	],
	[Orientation.RIGHT]: [
		["o", " ", "o", " ", " "],
		["o", " ", "o", " ", "o"],
		["o", " ", "o", " ", " "]
	]
};



/**
 * Fixed Tank Size
 */
const Size = {
	width: TankMapping[Orientation.UP][0].length,
	height: TankMapping[Orientation.UP].length
};

const TankStats = {
	health: 0,
	armor: 0,
	damage: 0
};

/**
 * Cooldown symbols (private)
 */
const CooldownSetter = Symbol("CooldownSetter");
const DefaultCooldownSetter = Symbol("DefaultCooldownSetter");
const GetCooldownValue = Symbol("GetCooldownValue");
const cooldowns = Symbol("cooldowns");
const defaultCooldowns = Symbol("defaultCooldowns");

/**
 * This class defines everything we need and know about a tank (client side and server side)
 * It extends renderer so that it can define a rendering function
 *
 * The options var keeps the initial values for the orientation, enemy, x, y
 *
 * in the PrivateActions we define the private functions for the actions that a tank can execute, ex: rotate and move
 */
class Tank extends Renderer {
	constructor(terminal) {
		super(terminal);

		this.stats = Object.assign({}, TankStats);

		this[cooldowns] = {};
		this[defaultCooldowns] = [
			{
				type: PrivateActions.shoot,
				val: 0
			},
			{
				type: PrivateActions.move,
				val: 0
			}
		];

		for(let cd of this[defaultCooldowns]){
			this[CooldownSetter](cd.type, 0);
		}
	}

	/**
	 * Tank properties setup
	 */
	setup(options) {
		this.orientation = options.orientation;
		this.enemy = options.enemy;
		this.id = options.id;

		if(options.stats){
			this.stats = options.stats;
		}

		if(options.cooldowns){
			for(let index in options.cooldowns){
				if(!options.cooldowns.hasOwnProperty(index))
					continue;

				this[defaultCooldowns][index].val = options.cooldowns[index].val;
			}
		}

		this.x = options.x;
		this.y = options.y;

		return this;
	}

	/**
	 * Set the tank properties. All the properties are selected by the client, but validated server side.
	 * @param properties
	 */
	setProperties(properties){
		for(let prop of properties){
			switch(prop.type){
				case TankProperties.CHASSIS:
					// 10 health means 5 frames cooldown
					this.stats.health = prop.value;
					this[DefaultCooldownSetter](PrivateActions.move, Math.floor(prop.value / 2));
					break;
				case TankProperties.ARMOR:
					// 2 armor:
					//	* damage reduction = armor (-2)
					//  * movement cooldown = armor (+2)
					this.stats.armor = prop.value;
					this[DefaultCooldownSetter](PrivateActions.move, prop.value);
					break;
				case TankProperties.WEAPON:
					this.stats.damage = prop.value;
					// 10 damage means 5 frames cooldown
					this[DefaultCooldownSetter](PrivateActions.shoot, prop.value * 2);
					break;
			}
		}

		return this;
	}

	/**
	 * Here we compute the rotation of the tank which can only rotate step by step (90 degrees, left or right)
	 */
	[PrivateActions.rotate](action) {
		if (Object.values(Rotation).indexOf(action.rotation) == -1) {
			throw new Error("Invalid rotation! Rotation: " + action.rotation);
		}
		this.orientation += action.rotation;
		this.orientation = this.orientation % 360;
		if (this.orientation < 0) {
			this.orientation = 360 + this.orientation;
		}

		return false;
	}

	/**
	 * Here we compute the movement of the tank, the tank can only go forward or backwards
	 * Based on the orientation, we know what FORWARD/BACKWARDS mean
	 */
	[PrivateActions.move](action) {
		if (Object.values(Direction).indexOf(action.direction) == -1) {
			throw new Error("Invalid direction! Direction: " + action.direction);
		}

		this[CooldownSetter](PrivateActions.move);

		let futurePosition = this.getFuturePosition(action);
		this.x = futurePosition.x;
		this.y = futurePosition.y;

		return false;
	}

	/**
	 * Shoot action based on the orientation
	 * It only shoots in front
	 */
	[PrivateActions.shoot](action) {
		let x = -1;
		let y = -1;
		switch(this.orientation){
			case Orientation.UP:
				x = Math.floor(Size.width / 2);
				y = 0;
				break;
			case Orientation.DOWN:
				x = Math.floor(Size.width / 2);
				y = Size.height;
				break;
			case Orientation.LEFT:
				x = 0;
				y = Math.floor(Size.height / 2);
				break;
			case Orientation.RIGHT:
				x = Size.width;
				y = Math.floor(Size.height / 2);
				break;
		}

		this[CooldownSetter](PrivateActions.shoot);

		return (new Bullet(this.term)).setup({
			id: action.bulletID,
			tankID: this.id,
			orientation: this.orientation,
			x: this.x + x,
			y: this.y + y
		}).move(1);
	}

	/**
	 * NOOP action
	 */
	[PrivateActions.noop](action) {
		return false;
	}

	/**
	 * Computes the next position of the tank, before applying the movement action
	 */
	getFuturePosition(action){
		let x = this.x;
		let y = this.y;

		if(action.direction) {
			switch (this.orientation) {
				case Orientation.UP:
					y -= action.direction;
					break;
				case Orientation.DOWN:
					y += action.direction;
					break;
				case Orientation.LEFT:
					x -= action.direction;
					break;
				case Orientation.RIGHT:
					x += action.direction;
					break;
			}
		}

		return {
			x: x,
			y: y
		};
	}

	/**
	 * Get the center point of the tank + tank positioning
	 */
	getCenterPosition() {
		let center = this.getCenter();
		return {
			x: this.x + center.x,
			y: this.y + center.y
		};
	}

	/**
	 * Get the center point of the tank (anchor/pivot center)
	 */
	getCenter(){
		return {
			x: 2,
			y: 2
		};
	}

	/**
	 * Function that applies damage when hit by a bullet
	 * Each armor point reduces damage by 1
	 */
	takeDamage(amount){
		amount = amount - this.stats.armor;
		if(amount <= 0)
			amount = 0;

		this.stats.health -= amount;
	}

	/**
	 * Returns current health
	 */
	getHealth(){
		return this.stats.health;
	}

	/**
	 * This is the function that apply a given action (from the Actions enum)
	 * These actions can be either move, rotate or shoot
	 *
	 * The action can come either from the networking stack or from the current running session
	 */
	applyAction(action) {
		if (Object.keys(Actions).indexOf(action.type) == -1) {
			throw new Error("Invalid action! Action: " + JSON.stringify(action));
		}

		if(action.health != undefined){
			this.stats.health = action.health;
		}

		// each frame we remove 1 cd time from each action
		for(let cd of this[defaultCooldowns]){
			this[CooldownSetter](cd.type, -1);
		}

		return this[PrivateActions[action.type]](action);
	}

	/**
	 * Reverts a previously failed applyAction
	 */
	revertAction(action){
		if (Object.keys(Actions).indexOf(action.type) == -1) {
			throw new Error("Invalid action! Action: " + JSON.stringify(action));
		}

		switch(action.type){
			case Actions.move:
				action.direction *= -1;
				break;
			case Actions.rotate:
				action.orientation *= -1;
				break;
		}
		this[PrivateActions[action.type]](action);
	}

	/**
	 * Checks if the current action type has a cooldown
	 */
	hasCooldown(type){
		return this[cooldowns][PrivateActions[type]] > 0;
	}

	getDefaultCooldowns(){
		return this[defaultCooldowns];
	}

	getCooldowns(){
		return this[cooldowns];
	}

	/**
	 * Easier check for hasCooldown(Actions.shoot)
	 */
	canShoot(){
		return !this.hasCooldown(Actions.shoot);
	}

	/**
	 * returns the tank mapping based on the orientation
	 */
	getMapping() {
		if (!TankMapping[this.orientation]) {
			throw new Error("Invalid tank orientation! Orientation: " + this.orientation);
		}

		return TankMapping[this.orientation];
	}

	/**
	 * Based on the orientation we render the tank from a static mapping
	 */
	render() {
		if(this.getHealth() <= 0)
			return;

		let tank = this.getMapping();
		this.term.bold();
		this.term.red();

		if (!this.enemy) {
			this.term.green();
		}

		// terminal coordinates are [1,1 - width,height]
		for (let i = 0; i < tank.length; i++) {
			for (let j = 0; j < tank[i].length; j++) {
				this.term.moveTo(this.x + j + 1, this.y + i + 1, tank[i][j]);
			}
		}

		this.term.styleReset();
	}

	[CooldownSetter](type, value) {
		if(value == undefined)
			value = this[GetCooldownValue](type);

		if(!this[cooldowns][type])
			this[cooldowns][type] = 0;

		this[cooldowns][type] += value;
		if (this[cooldowns][type] < 0)
			this[cooldowns][type] = 0;
	}

	[DefaultCooldownSetter](type, value) {
		for(let cd of this[defaultCooldowns]){
			if(type == cd.type){
				cd.val += value;
				break;
			}
		}
	}

	[GetCooldownValue](type) {
		for(let cd of this[defaultCooldowns]){
			if(type == cd.type){
				return cd.val;
			}
		}

		return false;
	}
}

module.exports.Tank = Tank;
module.exports.TankEnums = {
	Size: Size,
	Orientation: Orientation,
	Direction: Direction,
	Rotation: Rotation,
	Actions: Actions
};