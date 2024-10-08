const { Data } = require('./database');
const { corsEnabler, authentication, logging, reportRoute,
    getDevicesRoute, getRegisterRoute, deleteRegisterRoute,
    getDataRoute, postDataRoute, patchDataRoute,
    deleteDataRoute, downloadBackup } = require('./middleware');
const express = require('express');

express()
    .use(express.json())
    .use(corsEnabler)
    .use(authentication)
    .use(logging)
    .get('/:party/report/:type', reportRoute)
    .get('/devices', getDevicesRoute)
    .get('/register', getRegisterRoute)
    .delete('/register/:id', deleteRegisterRoute)
    .get('/:collection', getDataRoute)
    .post('/:collection', postDataRoute)
    .patch('/:collection/:id', patchDataRoute)
    .delete('/:collection/:id', deleteDataRoute)
    .get('/backup/:id', downloadBackup)
    .listen(8000, () => Data.init());