const Datastore = require('nedb');
const qr = require('qrcode-terminal');
const readline = require('readline-sync');



const devices = new Datastore({
    filename: 'data/main/devices.db',
    autoload: true
});

const operator = readline.question("Operator name: ");
const place = readline.question("Device location: ");
const type = readline.question("Operator type (admin|member|pr): ");
const id = readline.question("Device id: ");

console.log("Generating qr code...");

setTimeout(() => {
    const device = {
        operator: operator,
        place: place,
        type: type,
        icon: 0xe4a3,
        id: id,
        key: [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
    };

    devices.insert(device);
    qr.generate(JSON.stringify(device));
}, 1000);