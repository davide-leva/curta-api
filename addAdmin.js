const Datastore = require('nedb');
const qr = require('qrcode-terminal');
const devices = new Datastore({
    filename: 'data/main/devices.db',
    autoload: true
});

setTimeout(() => {
    const device = {
        operator: 'Davide',
        place: 'Remoto',
        type: 'admin',
        icon: 0xe4a3,
        id: 'dev-4261f9',
        key: [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
    };

    devices.insert(device);
    qr.generate(JSON.stringify(device));
}, 200);
