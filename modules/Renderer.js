
module.exports = class Renderer {
	/**
	 * Terminal is required so that we are able to render things on screen (terminal)
	 */
	constructor(terminal){
		this.term = terminal;
	}

	enable() {
		// does nothing, overwrite in child if needed
	}

	disable() {
		// does nothing, overwrite in child if needed
	}


	/**
	 * This is the rendering function that will be used when drawing is needed (in the game loop)
	 *
	 * requires overwrite in child to support rendering on screen/terminal
	 */
	render() {
		throw new Error("Method not implemented!");
	}
};