const Renderer = require("./Renderer");
const TankEnums = require("./Tank").TankEnums;
/**
 * This is a model for keeping track of the map
 * It only knows about how the map looks, width and height
 * It also extends rendering so if this is run on the client side, it knows how to render itself
 */
module.exports = class Map extends Renderer {
	constructor(terminal, map, spawns) {
		super(terminal);

		this._spawns = spawns;
		this._map = map;

		this._width = this._map[0].length;
		this._height = this._map.length;
	}

	/**
	 * Return the raw MAP matrix (0 = not walkable, 1 = walkable)
	 */
	get raw() {
		return this._map;
	}

	/**
	 * getter for width
	 */
	get width() {
		return this._width;
	}

	/**
	 * getter for height
	 */
	get height() {
		return this._height;
	}

	/**
	 * Get tank spawn position for the current map
	 */
	getSpawnLocation(index) {
		return this._spawns[index];
	}

	/**
	 * The renderer function for the Game Map
	 */
	render() {
		// terminal coordinates are [1,1 - width,height]
		for(let y = 0; y < this._height; y++){
			for(let x = 0; x < this._width; x++) {
				this.term.moveTo(x + 1,y + 1, this._map[y][x] != 0 ? "█" : " ");
			}
		}
	}
};