const { Data } = require('./database');
const { Socket } = require('./socket');
const { Document, DEFAULT_COLUMNS: FULL_REPORT_COLUMNS } = require('./document');
const { response } = require('express');

const socket = new Socket(30);

module.exports = {
    corsEnabler(req, res, next) {
        if (req.headers.origin != undefined) {
            const whitelist = [
                'https://lista.curtaevents.it',
                'https://staff.curtaevents.it',
                'http://localhost',
            ];

            if (whitelist.indexOf(req.headers.origin.split(':').slice(0, 2).join(':')) !== -1) {
                res.header('Access-Control-Allow-Origin', req.headers.origin);
            }
        }

        res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
        res.set('Access-Control-Allow-Headers', 'Content-Type, key, device');

        next();
    },

    authentication(req, res, next) {
        req.device = req.get('device');
        req.key = req.get('key');

        if (req.device == undefined || req.device == undefined) {
            req.device = req.query.device;
            req.key = req.query.key;
        }

        if (req.method == 'OPTIONS') {
            return next();
        } else if (req.device == undefined || req.key == undefined) {
            res.status(400).json({
                'status': 400,
                'reason': 'Set device and key headers'
            });
        } else return next();
    },

    logging(req, res, next) {
        if (req.method == 'OPTIONS') return next();

        const method = `API.${req.method}`;
        const space = " ".repeat(16 - method.length);
        console.log(`\x1b[32m${method}`, space, req.device, '->', req.path);
        next();
    },

    reportRoute(req, res, next) {
        res.setHeader('Content-disposition', 'inline; filename="' + req.params.type + '.pdf"');
        res.setHeader('Content-type', 'application/pdf');

        if (req.params.type == 'shop') {
            Data.getDocumentData(req.params.party, (err, data) => {
                new Document(650, 'assets/NunitoSans')
                    .header(
                        'assets/logo.png',
                        'Curta Events',
                        data.party.title,
                        Intl.DateTimeFormat('it-IT', {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                        }).format(Date.parse(data.party.date))
                    )
                    .table({
                        title: 'Spesa',
                        columns: FULL_REPORT_COLUMNS[0],
                        rows: data.tables[1]
                    })
                    .footer()
                    .pipe(res);
            });
        } else if (req.params.type == 'full') {
            Data.getDocumentData(req.params.party, (err, data) => {
                if (err) res.send(err);

                new Document(650, 'assets/NunitoSans')
                    .header(
                        'assets/logo.png',
                        'Curta Events',
                        data.party.title,
                        Intl.DateTimeFormat('it-IT', {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                        }).format(Date.parse(data.party.date))
                    )
                    .summary({
                        prevendite: data.totals[0],
                        entered: data.totals[1],
                        credit: data.totals[2],
                        debit: data.totals[3],
                        balance: data.totals[4]
                    })
                    .table({
                        title: 'Spesa',
                        columns: FULL_REPORT_COLUMNS[0],
                        rows: data.tables[1]
                    })
                    .table({
                        title: 'Gruppi',
                        columns: FULL_REPORT_COLUMNS[1],
                        rows: data.tables[0]
                    })
                    .table({
                        title: 'Costi e ricavi',
                        columns: FULL_REPORT_COLUMNS[2],
                        rows: data.tables[2]
                    })
                    .footer()
                    .pipe(res);
            });
        } else if (req.params.type == 'lista') {
            Data.getDocumentLista(req.params.party, (err, data) => {
                if (err) res.send(err);

                new Document(650, 'assets/NunitoSans')
                    .header(
                        'assets/logo.png',
                        'Curta Events',
                        data.party.title,
                        Intl.DateTimeFormat('it-IT', {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                        }).format(Date.parse(data.party.date))
                    )
                    .table({
                        title: 'Lista',
                        columns: FULL_REPORT_COLUMNS[3],
                        rows: data.table
                    })
                    .footer()
                    .pipe(res);
            });
        }
    },

    getDataRoute(req, res, next) {
        Data.get(req.params.collection, (err, data) => {
            if (err) {
                res.status(500);
                res.json({
                    'message': err
                });
            }
            res.status(200).json(data);
        });
    },

    getDevicesRoute(req, res, next) {
        res.status(200).json(socket.register.getConnectedDevices());
    },

    getRegisterRoute(req, res, next) {
        res.status(200).json(socket.register.getAllDevices());
    },

    deleteRegisterRoute(req, res, next) {
        socket.delete(req.params.id, (err, data) => {
            if (err) {
                res.status(500);
                res.json({
                    'message': err
                });
            }

            res.status(200).json({
                'eliminated': data == 1
            });
        });
    },

    postDataRoute(req, res, next) {
        if (req.params.collection == 'main:parties') {
            Data.create(req.body, (err) => {
                if (err) console.log(err);
            });
        } else {
            Data.insert(req.params.collection, req.body, (err, _, version) => {
                if (err) {
                    res.status(500);
                    res.json({
                        'message': err
                    });
                }

                if (req.headers.version != undefined) {
                    version = parseInt(req.headers.version);
                    Data.setVersion(req.params.collection, version);
                }

                res.status(200).json({ 'version': version });
            });
        }

        socket.update(req.params.collection);
    },

    patchDataRoute(req, res, next) {
        if (req.params.collection == 'devices') {
            socket.register.modify(req.body.id, req.body);
            socket.sendId(req.body.id, {
                'from': 'server',
                'to': req.body.id,
                'type': 'HANDSHAKE',
                'data': req.body
            });
            res.status(200).json({ 'version': 0 });
        } else {
            Data.update(req.params.collection, req.params.id, req.body, (err, data, version) => {
                if (err) {
                    res.status(500);
                    res.json({
                        'message': err
                    });
                }

                if (req.headers.version != undefined) {
                    version = parseInt(req.headers.version);
                    Data.setVersion(req.params.collection, version);
                }

                res.status(200).json({ 'version': version });
            });
        }

        socket.update(req.params.collection);
    },

    deleteDataRoute(req, res, next) {
        Data.remove(req.params.collection, req.params.id, (err, data, version) => {
            if (err) {
                res.status(500);
                res.json({
                    'message': err
                });
            }

            if (req.headers.version != undefined) {
                version = parseInt(req.headers.version);
                Data.setVersion(req.params.collection, version);
            }

            res.status(200).json({ 'version': version });
        });

        socket.update(req.params.collection);
    },

    downloadBackup(req, res, next) {
        const archive = `./backup/backup_${req.params.id}.zip`;
        res.download(archive);
    }
}