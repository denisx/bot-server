/**
 * @author denisx | Denis Khripkov <bot-server@denisx.ru>
 */

global.os = require('os');
global.NodeBot = require('node-telegram-bot');
// global.NodeBot = require('../node-telegram-bot/lib/Bot.js');


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
		keyboardInline: [], // max 4 * 12 (h*w); you can make more by height, but scroll'll be turned on
		resizeKeyboard: true,
		resizeKeyboardInline: true
	};
	self.saveQueueParams = opts.saveQueueParams;
	self.disable_web_page_preview = opts.disable_web_page_preview;
};

Bot.prototype.init = function (func) {
	var self = this;
	var origin = os.hostname();
	console.log('origin=', origin);
	self.settingsMachine = self.settings[origin];
	self.bot = new NodeBot({
		token: self.settingsMachine.bot.token
	});
	self.defMenuPath = self.settingsMachine.defMenuPath || 'start';
	self.menu = {};
	self.apiCallbackData = {};
	self.queue = {};
	self.onStack = {};
	self.dev = self.settingsMachine.bot.dev || false;
	self.botStoped = true;
	if (self.settingsMachine.botan) {
		self.bot.enableAnalytics(self.settingsMachine.botan.token);
	}
	if (func && typeof func == 'function') {
		func.call(self);
	}
	self.bot
		/** @param {Object} msg.from */
		.on('message', function(msg) { // local user event
			self.logMsg('bot on message', msg);
			self.getAPIOn('message', msg);
		})
		.on('callback_query', function(msg) { // local user event
			self.logMsg('bot on callback_query', msg);
			self.getAPIOn('callback_query', msg);
		})
		.on('stop', function (msg) { // local user event
			self.logMsg('bot /stop', msg);
			delete self.menu[self.getId(msg)];
		})
		.on('restart', function (msg) { // local user event
			self.logMsg('bot /restart', msg);
			delete self.menu[self.getId(msg)];
		})
		.on('start', function (msg) { // local user event
			self.logMsg('bot /start', msg);
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

Bot.prototype.logMsg = function (text, msg) {
	console.log();
	console.log(getDT(), text);
	Object.keys(msg).forEach(function (key) {
		console.log(key, JSON.stringify(msg[key]));
	});
};

Bot.prototype.getAPIOn = function (method, _msg) {
	var self = this;
	var msg;
	if (method == 'message') {
		msg = _msg;
	}
	if (method == 'callback_query') {
		msg = _msg.message;
		msg.__callback_query = _msg;
		msg.text = msg.__callback_query.data;
	}
	// console.log('bot new ' + method, msg);
	var id = self.getId(msg);
	if (!id || id == self.defMenuPath) { return; }
	self.apiCallbackData[id] = self.apiCallbackData[id] || {};
	self.menu[id] = self.menu[id] ||
		{
			path: self.defMenuPath,
			keyboardPath: self.defMenuPath,
			keyboardInlinePath: self.defMenuPath,
			lang: self.defaultLang,
			onWork: false
		};
	self.menu[id].lastPing = new Date();
	self.menu[id].texts = self.texts[self.menu[id].lang];
	self.queue[id] = self.queue[id] || [];
	self.queue[id].push(msg);
	self.onMessage(id);
};
/**
 * @param {Object} msg
 * @param {Object} msg.from
 * @param {Object} msg.chat
 */
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
			// menu.path = self.defMenuPath;
			// menu.keyboardPath = self.defMenuPath;
			// var opts = { //
			// 	chat_id: (menu.apiCallback) ? menu.apiCallback.msg.chat.id : 0,
			// 	message_id: (menu.apiCallback) ? menu.apiCallback.msg.message_id : 0,
			// 	reply_markup: {
			// 		keyboard: self.getKeyboard(id),
			// 		resize_keyboard: true
			// 	}
			// };
			// self.bot.editMessageReplyMarkup(opts, function (err, msg) {
			// 	self.apiCallback(id, err, msg);
			// });
			delete self.menu[id];
			delete self.apiCallbackData[id];
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

/**
 * @func onMessage
 * @param id
 */
Bot.prototype.onMessage = function (id) {
	var self = this;
	var menu = self.menu[id];
	if (!menu.onWork && self.queue[id].length) {
		var msg = self.queue[id].shift();
		menu.onWork = true;
		/**
		 * @param {Object} msg
		 * @param {Object} msg.contact
		 */
		menu.msg = msg;
		self.bot.sendChatAction({
			chat_id: menu.msg.chat.id,
			action: 'typing'
		}, function (err, msg) {
			self.apiCallback(id, err, msg);
		});

		if (msg.text) {
			return self.parseText(id);
		}
		if (msg.location) {
			return self.parseText(id);
		}
		if (msg.photo) {
			return self.parseText(id);
		}
		if (msg.contact) {
			return self.parseText(id);
		}
		console.error('error', 'botFree');
		menu.answer = 'no answer :|';
		self.commandAnswer(id);
	}
};

Bot.prototype.getKeyboard = function (id, isInline) {
	var self = this;
	/**
	 * @param {Object} menu
	 * @param {Object} menu.requestLocation
	 * @param {Object} menu.requestContact
	 * @param {Object} menu.keyboardAddOn
	 * @param {Object} menu.keyboardInlineAddOn
	 */
	var path = (isInline) ? 'botMenuInline': 'botMenu';
	var keyboardPath = (isInline) ? 'keyboardInlinePath': 'keyboardPath';
	var menu = self.menu[id];
	var keyboard = [];
	if (!menu.texts ||
		!menu[keyboardPath] ||
		!self.texts[path] ||
		!self.texts[path][menu[keyboardPath]]) {
		console.info('no menu for', menu[keyboardPath], isInline);
		return keyboard;
	}
	/**
	 * @param menu.texts.acceptCommands
	 */
	self.texts[path][menu[keyboardPath]].forEach(function(menuLine, i) {
		keyboard[i] = [];
		menuLine.forEach(function(menuItem) {
			var newKeyPiece = menu.texts.acceptCommands[menuItem];
			if (newKeyPiece) {
				if (isInline) {
					keyboard[i].push({
						text: newKeyPiece,
						callback_data: menuItem
					});
				} else {
					keyboard[i].push(newKeyPiece);
				}
			} else {
				console.error('no lang text for', menuItem);
			}
		});
	});

	if (isInline) {
		if (menu.keyboardInlineAddOn) {
			keyboard.unshift(menu.keyboardInlineAddOn);
			delete menu.keyboardInlineAddOn;
		}
	} else {
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

Bot.prototype.commandAnswer = function (id) {
	var self = this;
	var menu = self.menu[id];
	if (menu.answer && menu.answer.length && menu.answer != null) {
		menu.keyboard = self.getKeyboard(id);
		menu.keyboardInline = self.getKeyboard(id, true);
		if (!menu.keyboard.length && !menu.keyboardInline.length) {
			console.error(getDT(), 'no keyboards', menu.keyboard.length, menu.keyboardInline.length);
		}
		self.sendMessage(id);
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
		keyboardInlinePath: menu.keyboardInlinePath,
		saveQueueParams: menu.saveQueueParams
	};
	Object.keys(self.saveQueueParams).forEach(function (param) {
		tmp[param] = menu[param];
	});
	self.menu[id] = tmp;
	self.onMessage(id);
};

/**
 * @param {Object} opts
 * @param {string} opts.id
 * @param {int} opts.fromId
 * @param {int} opts.chatId
 * @param {function} callback
 */
Bot.prototype.sendClearMessage = function (opts, callback) {
	var self = this;
	/**
	 * @param {Object} menu
	 * @param {number} menu.id
	 * @param {Object} menu.msg
	 * @param {number} menu.msg.message_id
	 */
	var menu = self.menu[opts.id] || {};
	var fromId = opts.fromId || ((menu && menu.msg) ? menu.msg.from.id : '');
	var chatId = opts.chatId || ((menu && menu.msg) ? menu.msg.chat.id : '');
	if (!parseInt(chatId)) {
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
		reply_markup: opts.reply_markup || {},
		disable_web_page_preview: opts.disable_web_page_preview || true
	};
	if (fromId != chatId && menu && menu.msg && menu.msg.message_id) {
		set.reply_to_message_id = menu.msg.message_id;
	}
	self.bot.sendMessage(set, function (err, msg) {
		self.apiCallback(opts.id, err, msg);
		if (callback && typeof callback == 'function') {
			callback.call(self);
		}
	});
};

Bot.prototype.sendMessage = function (id, callback) {
	var self = this;
	/**
	 * @param {Object} menu
	 * @param {boolean} menu.noNextQueue
	 */
	var menu = self.menu[id];
	if (!menu.msg.chat.id) {
		console.error('err', 'empty chat.id', id, menu.msg);
		return;
	}
	var set = {
		chat_id: menu.msg.chat.id,
		// action: 'typing',
		text: menu.answer || menu.texts.botError,
		parse_mode: 'HTML',
		disable_web_page_preview: (menu.disable_web_page_preview) ? true: (self.disable_web_page_preview),
		replyMarkup: {

		}
	};
	if (menu.msg.chat.id != menu.msg.from.id) {
		set.reply_to_message_id = menu.msg.message_id;
	}

	if (menu.keyboardInline.length) {
		set.reply_markup = {
			inline_keyboard: menu.keyboardInline
		};
		if (menu.keyboard.length) {
			set.text = '...';
		}
		self.bot.sendMessage(set, function (err, msg) {
			if (err) { err.ss1 = menu.keyboardInline; }
			self.apiCallback(id, err, msg);
			if (!menu.keyboard.length) {
				if (callback) {
					callback.call(self, id);
				}
			}
		})
	}

	if (menu.keyboard.length) {
		set.reply_markup = {
			resize_keyboard: self.vars.resizeKeyboard,
			keyboard: menu.keyboard
		};
		set.text = menu.answer || menu.texts.botError;
		self.bot.sendMessage(set,
			function (err, msg) {
				if (err ) { err.ss2 = menu.keyboard; }
				self.apiCallback(id, err, msg);
				// menu.lastMsg = msg;
				if (callback) {
					callback.call(self, id);
				}
			});
	}

	if ( menu.noNextQueue ) {
		delete menu.noNextQueue;
	} else {
		self.goToQueue(id);
	}
};

Bot.prototype.apiCallback = function (id, err, msg) {
	var self = this;
	if (id) {
		self.apiCallbackData[id] = self.apiCallbackData[id] || {};
		if (err) {
			// console.log('apiCallback', id, 'err', err);
		}
		self.apiCallbackData[id] = {
			err: err,
			msg: msg
		};
	} else {
		if (err) {
			// console.error(getDT(), 'apiCallback', id, err);
		}
	}
};

Bot.prototype.on = function (menu, callback) {
	var self = this;
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
