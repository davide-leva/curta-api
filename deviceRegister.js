const Datastore = require('nedb');

const _genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

const devices = new Datastore({
    filename: 'data/main/devices.db',
    autoload: true,
});

const users = new Datastore({
    filename: 'data/main/users.db',
    autoload: true,
});

class _Device {
    constructor(data) {
        this.place = data['place'];
        this.operator = data['operator'];
        this.icon = data['icon'];
        this.type = data['type'];
        this.id = data['id'];
        this.key = data['key'];
    }

    toJson() {
        return {
            place: this.place,
            operator: this.operator,
            icon: this.icon,
            type: this.type,
            id: this.id,
            key: this.key,
        };
    }

    safeExport() {
        return {
            place: this.place,
            operator: this.operator,
            icon: this.icon,
            type: this.type,
            id: this.id,
        };
    }
}

class _User {
    constructor(data) {
        this.operator = data['operator'];
        this.type = data['type'];
        this.id = data['id'];
        this.key = data['key'];
        this.hash = data['hash'];
    }

    toJson() {
        return {
            operator: this.operator,
            type: this.type,
            id: this.id,
            key: this.key,
            hash: this.hash,
        };
    }
}

class _Notifier {
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

exports.DeviceRegister = class {
    constructor() {
        this._notifier = new _Notifier();
        this.pending = new Map();
        this.connected = [];
        this.sockets = [];


        devices.ensureIndex({ fieldName: 'id', unique: true });
        devices.find({}, (_, data) =>
            this._devices = data.map((deviceData, _, __) => new _Device(deviceData)));

        users.ensureIndex({ fieldName: 'operator', unique: true });
        users.find({}, (_, data) =>
            this._users = data.map((userData, _, __) => new _User(userData)));
    }

    register(client) {
        var regisid = 'regis-' + _genRanHex(128);
        this.pending.set(regisid, client);

        return regisid;
    }

    authRegistration(regisid, deviceData) {
        if (this.pending.has(regisid)) {
            var client = this.pending.get(regisid);
            this.pending.delete(regisid);

            var authkey = _genRanHex(64);
            var device = new _Device({
                place: deviceData.place,
                operator: deviceData.operator,
                icon: deviceData.icon,
                type: deviceData.type,
                id: client.id,
                key: authkey,
            });

            this._devices.push(device);
            devices.insert(device.toJson());

            return [authkey, client];
        }
    }

    authWeb(user, hash) {
        const candidateUser = this._users.find((u, _, __) => u['operator'] == user);
        if (candidateUser != undefined && candidateUser.hash == hash) {
            const device = new _Device({
                place: 'Web',
                operator: user,
                icon: 984484,
                type: candidateUser.type,
                id: candidateUser.id,
                key: candidateUser.key,
            });

            if (!this._devices.includes(device)) {
                this._devices.push(device);
            }

            this.connect(device.id);

            return [candidateUser.key, device.safeExport()];
        }

        return false;
    }

    addAdmin(deviceData) {
        var authKey = _genRanHex(64);
        var device = new _Device({
            place: deviceData.place,
            operator: deviceData.operator,
            icon: deviceData.icon,
            type: deviceData.type,
            id: deviceData.id,
            key: authKey,
        });

        this._devices.push(device);
        devices.insert(device.toJson());

        return [authKey, device];
    }

    addUser(userData) {
        var authkey = _genRanHex(64);
        var user = new _User({
            operator: userData.operator,
            type: userData.type,
            id: userData.id,
            key: userData.key,
            hash: userData.hash,
        });

        this._users.push(user);
        users.insert(user.toJson());

        return [authkey, user];
    }

    isRegistered(id) {
        var isRegistered = false;

        this._devices.forEach(device => {
            if (device.id == id) {
                isRegistered = true;
            }
        });

        return isRegistered;
    }

    getInfo(id) {
        var found = {};

        this._devices.forEach(device => {
            if (device.id == id) {
                found = device;
            }
        });

        return found.toJson();
    }

    isAdmin(id) {
        var isAdmin = false;

        this._devices.forEach(device => {
            if (device.id == id && device.type == 'admin') {
                isAdmin = true;
            }
        });

        return isAdmin;
    }

    isOnline(client) {
        return this.connected.includes(client.id);
    }

    modify(id, deviceData) {
        for (let i in this._devices) {
            if (this._devices[i].id == id) {
                var newDevice = new _Device({
                    place: deviceData.place,
                    operator: deviceData.operator,
                    icon: deviceData.icon,
                    type: deviceData.type,
                    id: this._devices[i].id,
                    key: this._devices[i].key,
                });

                this._devices[i] = newDevice;
                devices.update({ id: id }, newDevice.toJson());
                this._notifier.notify();
            }
        }
    }

    remove(id, cb) {
        devices.remove({ id: id }, (err, data) => {
            cb(err, data);
        });

        devices.find({}, (_, data) =>
            this._devices = data.map((deviceData, _, __) => new _Device(deviceData)));
    }

    auth(id, key) {
        const type = id.slice(0, 3);

        if (type == 'web') {
            for (let i in this._users) {
                if (this._users[i].id == id && this._users[i].key == key) {
                    return true;
                }
            }
        } else if (type == 'dev') {
            for (let i in this._devices) {
                if (this._devices[i].id == id && this._devices[i].key == key) {
                    return true;
                }
            }
        }

        return false;
    }

    connect(id) {
        if (!this.connected.includes(id)) {
            this.connected.push(id);
            this._notifier.notify();
            return true;
        }

        return false;
    }

    disconnect(id) {
        this.connected = this.connected.filter((v, _, __) => v != id);
        this._notifier.notify();
    }

    getConnectedDevices() {
        var connectedDevices = [];

        for (let j in this._devices) {
            for (let i in this.connected) {
                if (this._devices[j].id == this.connected[i]) {
                    if (!connectedDevices.map((d, _, __) => d.id).includes(this._devices[j].id)) {
                        connectedDevices.push(this._devices[j].safeExport());
                    }
                }
            }
        }

        return connectedDevices;
    }

    getAllDevices() {
        var devices = [];

        for (let i in this._devices) {
            devices.push(this._devices[i].safeExport());
        }

        return devices;
    }

    addListener(cb) {
        this._notifier.addListener(cb);
    }
}