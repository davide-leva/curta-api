const Datastore = require('nedb');

const _genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

const devices = new Datastore({
    filename: 'data/main/devices.db',
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
        

        devices.ensureIndex({fieldName: 'id', unique: true});
        devices.find({}, (_, data) => 
            this._devices = data.map((deviceData, _, __) => new _Device(deviceData)));
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
        this.devices.push(device);
        devices.insert(device.toJson());

        return [authKey, device];
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

    auth(id, key) {
        for(let i in this._devices) {
            if (this._devices[i].id == id && this._devices[i].key == key) {
                return true;
            }
        }

        return false;
    }

    addAdmin(deviceData) {

    }

    connect(id) {
        this.connected.push(id);
        this._notifier.notify();
    }

    disconnect(id) {
        this.connected = this.connected.filter((v, _, __) => v != id);
        this._notifier.notify();
    }

    getConnectedDevices() {
        var connectedDevices = [];

        for (let i in this.connected) {
            for (let j in this._devices) {
                if (this._devices[j].id == this.connected[i]) {
                    connectedDevices.push(this._devices[j].safeExport());
                }
            }
        }

        return connectedDevices;
    }

    addListener(cb) {
        this._notifier.addListener(cb);
    }
}