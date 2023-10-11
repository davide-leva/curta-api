const { ExceptionHandler } = require('winston');
const { WebSocketServer } = require('ws');
const { DeviceRegister } = require('./deviceRegister');

class _Event {
    constructor(data) {
        this.from = data['from'];
        this.to = data['to'];
        this.type = data['type'];
        this.data = data['data'];
    }
}

/*class _Notifier {
    constructor() {
        this.cbs = new Array();
    }

    notify() {
        this.cbs.forEach(cb => cb.call());
    }

    addListener(cb) {
        this.cbs.push(cb);
    }
}

class _DeviceRegister {
    constructor() {
        this._notifier = new _Notifier();
        this.devices = [];
    }

    add(client) {
        this.devices.push({
            'id': client.id,
            'operator': client.operator,
            'place': client.place
        });
        this._notifier.notify();
    }

    remove(client, silent = false) {
        this.devices = this.devices.filter((device) => device.id != client.id);
        if (!silent) this._notifier.notify();
    }

    modify(client) {
        this.remove(client, true);
        this.add(client);
    }

    addListener(cb) {
        this._notifier.addListener(cb);
    }
}*/

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
    client.send(JSON.stringify(data));
}

exports.Socket = class {
    constructor() {
        this.server = new WebSocketServer({
            port: 6000
        });

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
                            this.register.connect(client.id);
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

                        var p = this.register.authRegistration(
                            event.data.regis, event.data.device,
                        );

                        var key = p[0];
                        var client = p[1];

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
                } catch (err) {
                    console.log(err);
                }
            });

            client.on('close', (_, __) => {
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
}

_log = (eventData) => {
    const event = JSON.parse(eventData);
    console.log(`SOCKET.${event.type}`, `${event.from} -> ${event.to}`);
}
