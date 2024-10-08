const { DeviceRegister } = require('./deviceRegister')
const md5 = require('crypto-js/md5');

const register = new DeviceRegister();

const _genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

setTimeout(() => {
    register.addUser({
        operator: 'USERNAME',
        hash: md5('PASSWORD').toString(),
        type: 'PERMISSION',
        id: `web-${_genRanHex(6)}`,
        key: _genRanHex(64)
    });
}, 200);