const httpResult = Symbol("httpResult");
const reqSymbol = Symbol("req");
const resSymbol = Symbol("res");
const endSymbol = Symbol("ended");
const url = require('url');


/**
 * Converts a reqeust, resource from a http request into a HTTP Peer that simplifies the
 * communication via http
 */
module.exports = class HTTPPeer {
	constructor(req, res) {
		let self = this;
		self[reqSymbol] = req;
		self[resSymbol] = res;
		self[endSymbol] = false;
	}

	onReady(){
		let qs = url.parse(this[reqSymbol].url, true);

		return new Promise((resolve, reject) => {
			this[reqSymbol].body = [];
			this[reqSymbol].on('error', (err) => {
				console.log("Err", err);
				reject(err);
			}).on('data', (chunk) => {
				this[reqSymbol].body.push(chunk);
			}).on('end', () => {
				this[reqSymbol].body = Buffer.concat(this[reqSymbol].body).toString();

				this[httpResult] = {
					_headers: {},
					_body: [],
					_url: qs.pathname,
					_query: {
						post: this[reqSymbol].body,
						get: qs.query
					},
					_status: 200
				};

				resolve();
			});
		});
	}

	get url() {
		return this[httpResult]._url;
	}

	get query() {
		return this[httpResult]._query;
	}

	status(code) {
		if (this[endSymbol]) {
			return this;
		}

		this[httpResult]._status = code;
		return this;
	}

	header(name, body) {
		if (this[endSymbol]) {
			return this;
		}

		this[httpResult]._headers[name] = body;
		return this;
	}

	body(chunk) {
		if (this[endSymbol]) {
			return this;
		}

		this[httpResult]._body.push(chunk);
		return this;
	}

	json(obj){
		if (this[endSymbol]) {
			return false;
		}

		this.body(JSON.stringify(obj));
		this.end();
		return true;
	}

	end() {
		if (this[endSymbol]) {
			return this;
		}

		this[endSymbol] = true;
		this[resSymbol].writeHead(this[httpResult]._status, this[httpResult]._headers);

		if (this[httpResult]._body.length > 0)
			for (let i in this[httpResult]._body) {
				if (!this[httpResult]._body.hasOwnProperty(i))
					continue;
				this[resSymbol].write(this[httpResult]._body[i]);
			}

		this[resSymbol].end();
	}
};