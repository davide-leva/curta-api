const { Data } = require('./database');
const { Socket } = require('./socket');
const { Document, DEFAULT_COLUMNS: FULL_REPORT_COLUMNS } = require('./document');
const express = require('express');
const { requestWhitelist } = require('express-winston');

const socket = new Socket();

const app = express();
app.use(express.json());

// CORS Headers
app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', ['https://lista.curta-events.it']);
    res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
    res.set('Access-Control-Allow-Headers', 'Content-Type, key, device');

    next();
});

app.use((req, res, next) => {
    req.deviceID = req.get('device');
    next();
});

app.use((req, res, next) => {
    console.log(req.method, req.path);
    next();
});

// Authentication
/*app.use((req, res, next) => {
    if (req.path.split('/')[1] == 'pdf') next();

    if (req.get('key') == undefined ||
        req.get('key') != 'd82f725a9f936ec194861cb6b4c896d283f2a1f5ecc7cbd553c8506a5d9cf1ff') {
        res.json({
            'reason': 'apiKey is wrong'
        });
    } else next();
});*/

app.get('/test', (_, res) => {
    res.status(200).json({ 'ok': true });
})

app.get('/:party/report/:type', (req, res, next) => {
    res.contentType('application/pdf');
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
});

app.get('/versions/:collection', (req, res, next) => {
    Data.getVersion(req.params.collection, (version) => {
        res.status(200).json({
            version: version
        });
    })
});

app.get('/devices', (req, res, next) => {
    res.status(200).json(socket.register.getConnectedDevices());
});

app.get('/:collection', (req, res, next) => {
    Data.get(req.params.collection, (err, data) => {
        if (err) {
            res.status(500);
            res.json({
                'message': err
            });
        }
        res.status(200).json(data);
    });
});

app.post('/:collection', (req, res, next) => {
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
});

app.post('/set/:collection', (req, res, next) => {
    Data.set(req.params.collection, req.body);

    version = parseInt(req.headers.version);
    Data.setVersion(req.params.collection, version);

    res.status(200).json({ 'version': version });
});

app.patch('/:collection/:id', (req, res, next) => {
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
});

app.delete('/:collection/:id', (req, res, next) => {
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
});

app.listen(8000, () => Data.init());