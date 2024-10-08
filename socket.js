const { WebSocketServer } = require('ws');
const { DeviceRegister } = require('./deviceRegister');
const { make_backup } = require('./backup');

class _Event {
    constructor(data) {
        this.from = data['from'];
        this.to = data['to'];
        this.type = data['type'];
        this.data = data['data'];
    }
}

class _MessageError extends Error { }

function _handleMessage(target, type, data, cb) {

    try {
        const event = new _Event(JSON.parse(data));
        if (event.to == target
            || (target == 'device' && event.to.startsWith("dev-"))
            || target == '*') {
            if (event.type == type
                || type == '*') {
                cb(event);
            }
        }
    } catch (err) {
        throw new _MessageError(err.message);
    }
}

function _send(client, data) {
    const method = `WSS.${data.type}`;
    const space = " ".repeat(16 - method.length);
    console.log(`\x1b[33m${method}`, space, 'server    ', '->', data.to);
    client.send(JSON.stringify(data));
}

function _removeFromList(list, value) {
    var i = 0;

    while (i < list.length) {
        if (list[i] == value) {
            list.splice(i, 1);
        } else {
            ++i;
        }

    }
    return list;
}

exports.Socket = class {
    constructor(pingInterval) {
        this.server = new WebSocketServer({
            port: 6000
        });

        this.pingInterval = pingInterval;

        this.clients = [];
        this.register = new DeviceRegister();
        this.register.addListener(() => this.server.clients
            .forEach(reciver => _send(reciver, {
                'from': 'server',
                'to': reciver.id,
                'type': 'UPDATE',
                'data': {
                    'collection': 'devices'
                }
            })));

        setInterval(() => {
            this.server.clients.forEach((client) => _send(client, {
                'from': 'server',
                'to': client.id,
                'type': 'PING',
                'data': {
                    'interval': this.pingInterval,
                }
            }));
        }, pingInterval * 1000);

        this.server.on('connection', (client, req) => {
            client.on('message', (data) => {
                _log(data);

                try {
                    _handleMessage('server', 'HANDSHAKE', data, (event) => {
                        client.id = event.from;
                        client.operator = event.data.operator;
                        client.place = event.data.place;
                        client.icon = event.data.icon;
                        client.type = event.data.type;

                        if (this.register.isRegistered(client.id)) {
                            if (this.register.connect(client.id))
                                this.clients.push(client);

                            _send(client, {
                                'from': 'server',
                                'to': client.id,
                                'type': 'HANDSHAKE',
                                'data': this.register.getInfo(client.id)
                            });
                        } else {
                            var regis = this.register.register(client);
                            _send(client, {
                                'from': 'server',
                                'to': client.id,
                                'type': 'REGISTRATION',
                                'data': {
                                    'regis': regis
                                }
                            });
                        }
                    });

                    _handleMessage('server', 'AUTH', data, (event) => {
                        if (!this.register.isAdmin(event.from)) return;

                        const p = this.register.authRegistration(
                            event.data.regis, event.data.device,
                        );

                        const key = p[0];
                        const client = p[1];

                        _send(client, {
                            'from': 'server',
                            'to': client.id,
                            'type': 'AUTH',
                            'data': {
                                'key': key,
                                'device': event.data.device
                            }
                        });
                        _send(client, {
                            'from': 'server',
                            'to': client.id,
                            'type': 'HANDSHAKE',
                            'data': event.data.device
                        });
                    });

                    _handleMessage('server', 'LOGIN', data, (event) => {
                        const p = this.register.authWeb(event.data.user, event.data.hash);
                        if (!p) {
                            _send(client, {
                                'from': 'server',
                                'to': 'web',
                                'type': 'AUTH_FAIL',
                                'data': {}
                            });
                        } else {
                            _send(client, {
                                'from': 'server',
                                'to': p[1].id,
                                'type': 'AUTH',
                                'data': {
                                    'key': p[0],
                                    'device': p[1]
                                }
                            });
                            client.id = p[1]['id'];
                        }
                    });

                    _handleMessage('all', '*', data, (event) => {
                        this.server.clients.forEach(reciver => _send(reciver, {
                            from: event.from,
                            to: event.to,
                            type: event.type,
                            data: event.data
                        }));
                    });

                    _handleMessage('device', '*', data, (event) => {
                        this.server.clients.forEach(reciver => {
                            if (reciver.id == event.to) {
                                _send(reciver, {
                                    from: event.from,
                                    to: event.to,
                                    type: event.type,
                                    data: event.data
                                });
                            }
                        });
                    });

                    _handleMessage('server', 'BACKUP', data, async (event) => {
                        await make_backup();
                        this.update('main:backups', 'server');
                    });
                } catch (err) {
                    console.log(err);
                }
            });

            client.on('close', (_, __) => {
                _removeFromList(this.clients, client);
                this.register.disconnect(client.id);
            });
        });
    }

    sendId(id, event) {
        this.server.clients.forEach(c => {
            if (c.id == id) {
                c.send(JSON.stringify(event));
            }
        })
    }

    delete(id, cb) {
        this.register.remove(id, cb);
        this.server.clients.forEach(client => {
            if (client.id == id) {
                client.close();
            }
        });
    }

    update(collection) {
        this.server.clients.forEach(client => {
            _send(client, {
                'from': 'server',
                'to': client.id,
                'type': 'UPDATE',
                'data': {
                    'collection': collection
                }
            });
        });
    }
}

_log = (eventData) => {
    const event = JSON.parse(eventData);
    const method = `WSS.${event.type}`;
    const space = " ".repeat(16 - method.length);
    console.log(`\x1b[33m${method}`, space, event.from, '->', event.to);
}
