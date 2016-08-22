global.os = require('os');
global.NodeBot = require('node-telegram-bot');

var getDT = function (dt) {
	var now = dt ? new Date(dt) : new Date();
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
	self.defaultLang = opts.defaultLang;
	self.services = opts.services;
	self.settings = opts.settings;
	self.texts = opts.texts;
	self.saveQueueParams = opts.saveQueueParams;
	self.vars = {
		keyboard: [], // max 4 * 12 (h*w); you can make more by height, but scroll'll be turned on
		resizeKeyboard: true
	};
	self.saveQueueParams = opts.saveQueueParams;
	self.disable_web_page_preview = opts.disable_web_page_preview;
};

Bot.prototype.init = function () {
	var self = this;
	var origin = os.hostname();
	console.log('origin=', origin);
	self.settingsMachine = self.settings[origin];
	self.bot = new NodeBot({
		token: self.settingsMachine.bot.token
	});
	self.menu = {};
	self.queue = {};
	self.dev = self.settingsMachine.bot.dev || false;
	self.botStoped = true;
	if (self.settingsMachine.botan) {
		self.bot.enableAnalytics(self.settingsMachine.botan.token);
	}
	self.bot
		/** @param {Object} msg.from */
		.on('message', function(msg) { // local user event
			console.log();
			console.log(getDT());
			console.log('bot new message', msg);
			var id = self.getId(msg);
			if (!id || id == '/') { return; }
			self.menu[id] = self.menu[id] ||
				{
					path: '/',
					keyboardPath: '/',
					lang: self.defaultLang,
					onWork: false
				};
			self.menu[id].lastPing = new Date();
			self.menu[id].texts = self.texts[self.menu[id].lang];
			self.queue[id] = self.queue[id] || [];
			self.queue[id].push(msg);
			self.onMessage(id);
		})
		.on('stop', function (msg) { // local user event
			console.log('bot /stop', msg);
			delete self.menu[self.getId(msg)];
		})
		.on('restart', function (msg) { // local user event
			console.log('bot /restart', msg);
			delete self.menu[self.getId(msg)];
		})
		.on('start', function (msg) { // local user event
			console.log('bot /start', msg);
		})
		.on('error', function (err) { // global user event
			console.log('bot error', getDT(), err.code);
			self.bot.stop();
			if (['ENOTFOUND'].indexOf(err.code) > -1) {
				console.log('error here, code=', err.code);
			} else {
				console.error('new error code=', err.code);
			}
			setTimeout(function () {
				self.bot.start();
				console.log('bot start', getDT());
			}, 1000);
		})
		.start();
	console.log('bot start', getDT());
	self.clearSessions();
	
	return this;
};

Bot.prototype.getId = function (msg) {
	var fromId = (msg && msg.from) ? msg.from.id : '';
	var chatId = (msg && msg.chat) ? msg.chat.id : '';
	return chatId + '/' + fromId;
};

Bot.prototype.clearSessions = function () {
	var self = this;
	var now = new Date();
	var sessionMinutes = 15;
	Object.keys(self.menu).forEach(function (id) {
		var menu = self.menu[id];
		if ((menu.lastPing - 1) + sessionMinutes * 60 * 1000 < now - 1) {
			menu.path = '/';
			menu.keyboardPath = '/';
			var opts = {
				id: id,
				userText: 'Session end. Go to Start.',
				disable_notification: true,
				reply_markup: {
					keyboard: self.getKeyboard(id),
					resize_keyboard: true
				}
			};
			self.sendClearMessage(opts);
			delete self.menu[id];
		}
	});
	setTimeout(function () {
		self.clearSessions();
	}, 60 * 1000);
};

Bot.prototype.stop = function () {
	var self = this;
	self.bot.stop();
};

Bot.prototype.onMessage = function (id) {
	var self = this;
	var menu = self.menu[id];
	if (!menu.onWork && self.queue[id].length) {
		var msg = self.queue[id].shift();
		menu.onWork = true;
		menu.msg = msg;
		var botFree = true;
		if (botFree && msg.text) {
			botFree = false;
			self.parseText(id);
		}
		if (botFree && msg.location) {
			botFree = false;
			self.parseText(id);
		}
		if (botFree && msg.location) {
			botFree = false;
			self.parseText(id);
		}
		if (botFree && msg.contact) {
			botFree = false;
			self.parseText(id);
		}
		if (botFree) {
			console.error('error', 'botFree');
			botFree = false;
			menu.answer = 'no answer :|';
			self.commandAnswer(id);
			// self.parseText(id);
		}
	}
};

Bot.prototype.getKeyboard = function (id) {
	var self = this;
	var menu = self.menu[id];
	var keyboard = [];
	if (!menu.texts || !self.texts.botMenu[menu.keyboardPath]) {
		console.error('no menu for', menu.keyboardPath);
		return keyboard;
	}
	self.texts.botMenu[menu.keyboardPath].forEach(function(menuLine, i) {
		keyboard[i] = [];
		menuLine.forEach(function(menuItem) {
			var newKeyPiece = menu.texts.acceptCommands[menuItem];
			if (newKeyPiece) {
				keyboard[i].push(newKeyPiece);
			} else {
				console.error('no lang text for', menuItem);
			}
		});
	});
	if (menu.requestLocation) {
		delete menu.requestLocation;
		keyboard.unshift([{text: menu.texts.waitForGeoButtonText, request_location: true}]);
	}
	if (menu.requestContact) {
		delete menu.requestContact;
		keyboard.unshift([{text: menu.texts.waitForContactButtonText, request_contact: true}]);
	}
	if (menu.keyboardAddOn) {
		keyboard.unshift(menu.keyboardAddOn);
		delete menu.keyboardAddOn;
	}
	return keyboard;
};

Bot.prototype.parseText = function (id) {
	var self = this;
	var menu = self.menu[id];
	menu.answer = '';
	var userText = ((menu.msg && menu.msg.text) ? menu.msg.text : '').replace(/^\//, '').toLowerCase();
	var command = '';
	if (!menu.texts) {
		console.error('use menu.noNextQueue');
		return;
	}
	if ( !menu.texts.acceptCommands ) {
		console.error('no texts on lang,', menu.lang);
		return;
	}
	Object.keys(menu.texts.acceptCommands).forEach(function (key) {
		var keyLow = key.toLowerCase();
		var elem = menu.texts.acceptCommands[key].toLowerCase();
		if (keyLow == userText || elem == userText ) {
			command = key;
		}
	});
	/** @param {Object} menu.dropCommand */
	/** @param {Object} menu.dropUserText */
	command = (menu.dropCommand) ? '' : command;
	delete menu.dropCommand;
	menu.command = command;
	menu.userText = (menu.dropUserText) ? '' : userText;
	delete menu.dropUserText;
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
		self.goToQueue(id);
	}
};

Bot.prototype.goToQueue = function (id) {
	var self = this;
	var menu = self.menu[id];
	var tmp = {
		onWork: false,
		lang: menu.lang,
		path: menu.path,
		texts: menu.texts,
		lastPing: menu.lastPing,
		keyboardPath: menu.keyboardPath,
		saveQueueParams: menu.saveQueueParams
	};
	Object.keys(self.saveQueueParams).forEach(function (param) {
		tmp[param] = menu[param];
	});
	self.menu[id] = tmp;
	self.onMessage(id);
};

Bot.prototype.sendClearMessage = function (opts) {
	var self = this;
	var menu = self.menu[opts.id];
	var fromId = opts.fromId || ((menu && menu.msg) ? menu.msg.from.id : '');
	var chatId = opts.chatId || ((menu && menu.msg) ? menu.msg.chat.id : '');
	if (parseInt(chatId)) {
		console.error('chatId=', chatId);
		console.error('fromId=', fromId);
		console.error('sendClearMessage', 'chatId is empty');
		return;
	}
	// if (fromId == chatId) {
	// 	opts.userText += opts.himselfText || 'himself';
	// }
	var set = {
		chat_id: chatId,
		action: 'typing',
		text: opts.userText || ' ',
		parse_mode: 'HTML',
		disable_notification: opts.disable_notification || false,
		reply_markup: opts.reply_markup || {}
	};
	if (fromId != chatId && menu.msg && menu.msg.message_id) {
		set.reply_to_message_id = menu.msg.message_id;
	}
	self.bot.sendMessage(set);
};

Bot.prototype.sendMessage = function (id, callback) {
	var self = this;
	var menu = self.menu[id];
	if (!menu.msg.chat.id) {
		console.error('err', 'empty chat.id', id, menu.msg);
		return;
	}
	var set = {
		chat_id: menu.msg.chat.id,
		action: 'typing',
		text: menu.answer || menu.texts.botError,
		parse_mode: 'HTML',
		reply_markup: {
			keyboard: menu.keyboard,
			resize_keyboard: self.vars.resizeKeyboard
		},
		disable_web_page_preview: (menu.disable_web_page_preview) ? true: (self.disable_web_page_preview)
	};
	if (menu.msg.chat.id != menu.msg.from.id) {
		set.reply_to_message_id = menu.msg.message_id;
	}
	self.bot.sendMessage(set,
		function(err, msg) {
			menu.lastMsg = msg;
			if (!err && callback) {
				// console.log(1, msg.message_id);
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
	self.onStack = self.onStack || {};
	var on = self.onStack;
	if (typeof callback == 'function') { // init on
		on[menu] = callback;
	} else { // call, id = callback
		if (on['beforeAction']) {
			on['beforeAction'].call(self, callback);
		}
		if (on[menu]) {
			on[menu].call(self, callback);
		} else {
			if (on['default']) {
				on['default'].call(self, callback);
			}
		}
		if (on['afterAction']) {
			on['afterAction'].call(self, callback);
		}
	}
	return this;
};

module.exports = function (opts) {
	if (!opts) { return; }
	return new Bot(opts);
};
