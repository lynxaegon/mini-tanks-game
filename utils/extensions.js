/**
 * This is used for static extensions over JavaScript Objects
 */


/**
 * Helper for executing a map function over an object (key-value pair)
 */
Object.map = function (o, f, ctx) {
	ctx = ctx || this;
	let result = {};
	Object.keys(o).forEach(function (k) {
		result[k] = f.call(ctx, o[k], k, o);
	});
	return result;
};
/**
 * Checks if a number is between 2 other numers (not inclusive)
 */
Number.between = function (number, a, b) {
	let min = Math.min.apply(Math, [a, b]),
		max = Math.max.apply(Math, [a, b]);
	return number > min && number < max;
};

/**
 * Generates a random number between min,max (inclusive)
 */
Number.random = function (min, max) {
	return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Returns a random item from an array
 */
Array.prototype.random = function () {
	return this[Math.floor((Math.random()*this.length))];
};

/**
 * Returns a random number from an array, and also removes it
 */
Array.prototype.randomSplice = function () {
	let item = this.random();
	let idx = this.indexOf(item);
	this.splice(idx, 1);{}
	return item;
};

/**
 * Returns a sort function, that sorts an array of object
 *
 * the fields pararm is an array that contains sortBy fields, if field contains a "-" it sorts descending
 */
Array.sortBy = (fields) => {
	return function (a, b) {
		return fields
		.map(function (o) {
			let dir = 1;
			if (o[0] === '-') {
				dir = -1;
				o = o.substring(1);
			}
			if (a[o] > b[o]) return dir;
			if (a[o] < b[o]) return -(dir);
			return 0;
		})
		.reduce(function firstNonZeroValue(p, n) {
			return p ? p : n;
		}, 0);
	};
};