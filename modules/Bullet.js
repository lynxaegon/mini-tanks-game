const Renderer = require("./Renderer");

const Orientation = {
	UP: 0,
	DOWN: 180,
	LEFT: 270,
	RIGHT: 90
};
class Bullet extends Renderer {
	constructor(terminal, options) {
		super(terminal);
	}

	setup(options) {
		this.id = options.id;
		this.tankID = options.tankID;
		this.orientation = options.orientation;
		this.x = options.x;
		this.y = options.y;

		this.oldX = this.x;
		this.oldY = this.y;
		return this;
	}

	/**
	 * Used for bullet collsion map
	 * We first apply the bullet movement than check for collisions, so it's possible we miss a collision
	 */
	getPreviousPosition(){
		return {
			x: this.oldX,
			y: this.oldY,
		}
	}

	getMapping(){
		return [
			["o"]
		];
	}

	move(speed) {
		this.oldX = this.x;
		this.oldY = this.y;
		switch (this.orientation) {
			case Orientation.LEFT:
				this.x -= speed;
				break;
			case Orientation.RIGHT:
				this.x += speed;
				break;
			case Orientation.UP:
				this.y -= speed;
				break;
			case Orientation.DOWN:
				this.y += speed;
				break;
		}
		return this;
	}

	applyAction(action) {
		this.move(1);
	}

	/**
	 * Based on the orientation we render the bullet
	 */
	render() {
		let bullet = this.getMapping();
		this.term.bold();
		this.term.blue();

		// terminal coordinates are [1,1 - width,height]
		for (let i = 0; i < bullet.length; i++) {
			for (let j = 0; j < bullet[i].length; j++) {
				this.term.moveTo(this.x + j + 1, this.y + i + 1, bullet[i][j]);
			}
		}

		this.term.styleReset();
	}
}

module.exports.Bullet = Bullet;
module.exports.BulletEnums = {
	Orientation: Orientation
};