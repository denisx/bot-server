global.os = require('os');
global.NodeBot = require('node-telegram-bot');

var getDT = function () {
	var now = new Date();
	return [
		now.getFullYear(), '-',
		('0' + (now.getMonth() + 1)).slice(-2), '-',
		('0' + now.getDate()).slice(-2), ' ',
		('0' + now.getHours()).slice(-2), ':',
		('0' + now.getMinutes()).slice(-2), ':',
		('0' + now.getSeconds()).slice(-2)
	].join('');
};

var Bot = function(opts) {
	console.log('');
	console.log('');
	console.log('=== === ===');
	console.log('Starting server', getDT());
	console.log('');
	var self = this;
	self.dev = opts.dev || false;
	self.default_lang = opts.default_lang;
	self.services = opts.services;
	self.settings = opts.settings;
	self.texts = opts.texts;
	self.save_queue_params = opts.save_queue_params;
	self.vars = {
		keyboard: [], // max 4 * 12 (h*w); you can make more by height, but scroll'll be turned on
		resize_keyboard: true
	};
	self.save_queue_params = opts.save_queue_params;
};

Bot.prototype.init = function () {
	var self = this;
	var origin = os.hostname();
	self.settings_machine = self.settings[origin];
	self.bot = new NodeBot({
		token: self.settings_machine.bot.token
	});
	self.menu = {};
	self.queue = {};
	self.dev = self.settings_machine.bot.dev || false;
	self.bot_stoped = true;
	self.bot.enableAnalytics(self.settings_machine.botan.token);
	self.bot
		/** @param {Object} msg.from */
		.on('message', function(msg) { // local user event
			console.log();
			console.log(getDT());
			console.log('bot new message', msg);
			var id = (msg && msg.from) ? msg.from.id : null;
			if (!id) { return; }
			self.menu[id] = self.menu[id] ||
				{
					path: '/',
					keyboard_path: '/',
					lang: self.default_lang,
					on_work: false
				};
			self.menu[id].last_ping = new Date();
			self.menu[id].texts = texts[self.menu[id].lang];
			self.queue[id] = self.queue[id] || [];
			self.queue[id].push(msg);
			self.onMessage(id);
		})
		.on('stop', function (msg) { // local user event
			console.log('bot /stop', msg);
		})
		.on('start', function (msg) { // local user event
			console.log('bot /start', msg);
		})
		.on('error', function (err) { // global user event
			console.log('bot error', getDT(), err.code);
			self.bot.stop();
			if (['ENOTFOUND'].indexOf(err.code) > -1) {
				setTimeout(function () {
					self.bot.start();
					console.log('bot start', getDT());
				}, 1000);
			} else {
				console.error('new error code', err.code);
			}
		})
		.start();
	console.log('bot start', getDT());
	return this;
};

Bot.prototype.clearSessions = function () {
	var self = this;
	var now = new Date();
	var session_minutes = 15;
	Object.keys(self.menu).forEach(function (id) {
		var menu = self.menu[id];
		console.log('check last ping', id, getDT(menu.last_ping - 1), ' || ', getDT((menu.last_ping - 1) + session_minutes * 60 * 1000), ' || ', getDT(now - 1));
		if ((menu.last_ping - 1) + session_minutes * 60 * 1000 < now - 1) {
			console.log('clear', id, getDT(menu.last_ping - 1), getDT(now - 1));
			delete self.menu[id];
		}
	});
};

Bot.prototype.stop = function () {
	var self = this;
	self.bot.stop();
};

Bot.prototype.onMessage = function (id) {
	var self = this;
	var menu = self.menu[id];
	if (!menu.on_work && self.queue[id].length) {
		var msg = self.queue[id].shift();
		menu.on_work = true;
		menu.msg = msg;
		var bot_free = true;
		if (bot_free && msg.text) {
			bot_free = false;
			self.parseText(id);
		}
		if (bot_free && msg.location) {
			bot_free = false;
			self.parseText(id);
		}
		if (bot_free && msg.photo) {
			bot_free = false;
			self.parseText(id);
		}
		if (bot_free) {
			console.error('error', 'bot_free');
			bot_free = false;
			menu.answer = 'no answer :)';
			self.commandAnswer(id);
		}
	}
};

Bot.prototype.getKeyboard = function (id) {
	var self = this;
	var menu = self.menu[id];
	var keyboard = [];
	if (!self.texts.bot_menu[menu.keyboard_path]) {
		console.error('no menu for', menu.keyboard_path);
		return keyboard;
	}
	self.texts.bot_menu[menu.keyboard_path].forEach(function(menu_line, i) {
		keyboard[i] = [];
		menu_line.forEach(function(menu_item) {
			var new_key_piece = menu.texts.accept_commands[menu_item];
			if (new_key_piece) {
				keyboard[i].push(new_key_piece);
			} else {
				console.error('no lang text for', menu_item);
			}
		});
	});
	if (menu.request_location) {
		delete menu.request_location;
		keyboard.unshift([{text: menu.texts.wait_for_geo_button_text, request_location: true}]);
	}
	if (menu.request_contact) {
		delete menu.request_contact;
		keyboard.unshift([{text: menu.texts.wait_for_contact_button_text, request_contact: true}]);
	}
	if (menu.keyboard_addOn) {
		keyboard.unshift(menu.keyboard_addOn);
		delete menu.keyboard_addOn;
	}
	return keyboard;
};

Bot.prototype.parseText = function (id) {
	var self = this;
	var menu = self.menu[id];
	menu.answer = '';
	var user_text = ((menu.msg && menu.msg.text) ? menu.msg.text : '').replace(/^\//, '').toLowerCase();
	var command = '';
	if (!menu.texts) {
		console.error('use menu.noNextQueue');
		return;
	}
	if ( !menu.texts.accept_commands ) {
		console.error('no texts on lang,', menu.lang);
		return;
	}
	Object.keys(menu.texts.accept_commands).forEach(function (key) {
		var elem = menu.texts.accept_commands[key].toLowerCase();
		if (key == user_text || elem == user_text ) {
			command = key;
		}
	});
	/** @param {Object} menu.drop_command */
	command = (menu.drop_command) ? '' : command;
	delete menu.drop_command;
	menu.command = command;
	menu.user_text = (menu.drop_user_text) ? '' : user_text;
	delete menu.drop_user_text;
	self.on(menu.path, id);
};

Bot.prototype.commandAnswer = function (id, callback) {
	var self = this;
	var menu = self.menu[id];
	if (menu.answer && menu.answer.length && menu.answer != null) {
		menu.keyboard = self.getKeyboard(id);
		self.sendMessage(id, callback);
	} else {
		menu.answer += 'no answer';
		console.error('commandAnswer has empty answer');
		self.goToQueue();
	}
};

Bot.prototype.goToQueue = function (id) {
	var self = this;
	var menu = self.menu[id];
	var tmp = {
		path: menu.path,
		last_ping: menu.last_ping,
		on_work: false,
		keyboard_path: menu.keyboard_path,
		lang: menu.lang,
		save_queue_params: menu.save_queue_params
	};
	Object.keys(self.save_queue_params).forEach(function (param) {
		tmp[param] = menu[param];
	});
	self.menu[id] = tmp;
	self.onMessage(id);
};

Bot.prototype.sendClearMessage = function (opts) {
	var self = this;
	if (opts.id == opts.to_id) {
		opts.user_text += opts.himself_text;
	}
	self.bot.sendMessage({
		chat_id: opts.to_id,
		action: 'typing',
		text: opts.user_text || '',
		parse_mode: 'HTML'
	});
};

Bot.prototype.sendMessage = function (id, callback) {
	var self = this;
	var menu = self.menu[id];
	self.bot.sendMessage({
			chat_id: menu.msg.chat.id,
			action: 'typing',
			text: menu.answer || menu.texts.bot_error,
			parse_mode: 'HTML',
			reply_markup: {
					keyboard: menu.keyboard,
					resize_keyboard: self.vars.resize_keyboard
				}
		}, function(err, msg) {
			menu.last_msg = msg;
			if (!err && callback) {
				console.log(1, msg.message_id);
				callback.call(self, id, msg.message_id);
			}
	});
	if ( menu.noNextQueue ) {
		delete menu.noNextQueue;
	} else {
		self.goToQueue(id);
	}
};

Bot.prototype.on = function (menu, callback) {
	var self = this;
	self._on = self._on || {};
	var on = self._on;
	if (typeof callback == 'function') { // init on
		on[menu] = callback;
	} else { // call, id = callback
		if (on['before_action']) {
			on['before_action'].call(self, callback);
		}
		if (on[menu]) {
			on[menu].call(self, callback);
		} else {
			if (on['default']) {
				on['default'].call(self, callback);
			}
		}
		if (on['after_action']) {
			on['after_action'].call(self, callback);
		}
	}
	return this;
};

module.exports = function (opts) {
	if (!opts) { return; }
	return new Bot(opts);
};
