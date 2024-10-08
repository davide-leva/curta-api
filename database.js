const { mkdirSync, truncateSync } = require('fs')
const { ensureFile } = require('fs-extra');
const Datastore = require('nedb');

const DB = {
    'main:versions': new Datastore({
        filename: './data/main/versions.db',
        autoload: true,
    }),
    'main:parties': new Datastore({
        filename: './data/main/parties.db',
        autoload: true,
    }),
    'main:bank': new Datastore({
        filename: './data/main/bank.db',
        autoload: true
    }),
    'main:config': new Datastore({
        filename: './data/main/config.db',
        autoload: true,
    }),
    'main:backups': new Datastore({
        filename: './data/main/backups.db',
        autoload: true,
    }),
    'product:products': new Datastore({
        filename: './data/products/prices.db',
        autoload: true,
    }),
    'product:inventory': new Datastore({
        filename: './data/products/inventory.db',
        autoload: true,
    })
};

const Collections = {
    groups: '/groups.db',
    shop: '/shop.db',
    transactions: '/transactions.db',
    shifts: '/shifts.db',
};

const _loadDBs = () => DB['main:parties'].find({}, (err, parties) => {
    for (var pid in parties) {
        let party = parties[pid].tag;
        for (var collection in Collections) {
            DB[party + ':' + collection] = new Datastore({
                filename: `./data/${party}${Collections[collection]}`,
                autoload: true
            });
        }
    }
});

function _find(list, id) {
    for (let i in list) {
        if (list[i]['_id'] == id) return list[i];
    }
}

function _abs(x) {
    if (x < 0) return -x;
    else return x;
}

exports.Data = class {
    static init() {
        _loadDBs();
    }
    static create(party, cb) {
        DB['main:parties'].find({ tag: party.tag }, (err, data) => {
            if (err) cb(err);

            if (data.length != 0) {
                cb(Error("Party already exists"))
            } else {
                this.insert('main:parties', party, (err, data, _) => {
                    if (err) cb(err);

                    mkdirSync(`./data/${party.tag}/`);
                    ensureFile(`./data/${party.tag}/groups.db`);
                    ensureFile(`./data/${party.tag}/shifts.db`);
                    ensureFile(`./data/${party.tag}/shop.db`);
                    ensureFile(`./data/${party.tag}/transactions.db`);

                    _loadDBs();
                });
            }
        });
    }

    static insert(db, data, cb) {
        if (db in DB) {
            DB[db].insert(data, (err, data) => {
                this.updateVersion(db, (version) => {
                    cb(err, data, version);
                });
            });
        }
    }

    static get(db, cb) {
        if (db in DB) {
            DB[db].find({}, (err, data) => {
                this.getVersion(db, (version) => {
                    cb(err, data, version);
                });
            });
        }
    }

    static getShop(party, cb) {
        const db = party + ':shop';

        DB[db].find({}, (err1, prds) => {
            this.getVersion(db, (version) => {
                DB['product:products'].find({}, (err2, prcs) => {
                    const entries = [];
                    var total = 0;
                    var prev = 0;

                    prds.forEach(prd => {
                        prcs.forEach(prc => {
                            if (prd.product == prc._id) {
                                entries.push({
                                    product: prc.name,
                                    price: prc.price,
                                    quantity: prd.quantity,
                                    purchased: prd.purchased
                                });

                                if (prd.purchased) {
                                    total += prc.price * prd.quantity;
                                }
                                prev += prc.price * prd.quantity;
                            }
                        });
                    });

                    DB['main:parties'].find({ "tag": party }, (err3, prt) => {
                        cb((err1 || err2) || err3, {
                            info: {
                                total: total,
                                prev: prev,
                                partyName: prt[0].title,
                                partyDate: (new Date(prt[0].date)).toLocaleDateString()
                            },
                            items: entries
                        }, version);
                    });

                });
            })
        });
    }

    static update(db, id, changes, cb) {
        if (db in DB) {
            DB[db].update({ _id: id }, changes, (err, data) => {
                this.updateVersion(db, (version) => {
                    cb(err, data, version);
                });
            });
        }
    }

    static remove(db, id, cb) {
        if (db in DB) {
            DB[db].remove({ _id: id }, (err, data) => {
                this.updateVersion(db, (version) => {
                    cb(err, data, version);
                });
            });
        }
    }

    static getVersion(db, cb) {
        if (db in DB) {
            DB['main:versions'].findOne({ 'db': db }, (err, data) => {
                if (data != null) {
                    cb(data['version']);
                } else {
                    cb(0);
                }
            });
        }
    }

    static setVersion(db, version) {
        if (db in DB) {
            if (DB['main:versions'].find({ 'db': db }, (err, data) => {
                if (data.length != 0) {
                    DB['main:versions'].update({ 'db': db }, { 'db': db, 'version': version, });
                } else {
                    DB['main:versions'].insert({
                        'db': db,
                        'version': version,
                    })
                }
            }));
        }
    }

    static updateVersion(db, cb) {
        this.getVersion(db, (version) => {
            this.setVersion(db, version + 1);
            cb(version + 1);
        });
    }

    static set(db, data) {
        if (db in DB) {
            DB[db].remove({});
            for (let doc in data) {
                DB[db].insert(doc);
            }
        }
    }

    static getDocumentData(tag, cb) {
        DB['main:parties'].find({}, (err, data) => {
            if (err) cb(err);

            const party = data.filter((p, _, __) => p.tag == tag)[0];
            const tables = [];
            const totals = [];

            DB[tag + ':groups'].find({}, (err, data) => {
                if (err) cb(err);

                data.forEach(group => {
                    group['notSelled'] = group['people']
                        .map(p => JSON.parse(p))
                        .map(p => p.hasPaid ? 0 : 1)
                        .reduce((prev, current, _) => prev + current, 0);

                    group['discount'] = group['people']
                        .map(p => JSON.parse(p))
                        .map(p => p.discount)
                        .reduce((prev, current, _) => prev + current, 0);
                });

                totals.push(data
                    .map(g => {
                        return g['people'].map(p => JSON.parse(p))
                    })
                    .map(g => {
                        return g.map(p => p.hasPaid ? 1 : 0);
                    })
                    .map(g => g.reduce((prev, current, _) => prev + current, 0))
                    .reduce((prev, current, _) => prev + current, 0));

                var totalEntered = data
                    .map(g => {
                        return g['people'].map(p => JSON.parse(p))
                    })
                    .map(g => {
                        return g.map(p => p.hasEntered ? 1 : 0);
                    })
                    .map(g => g.reduce((prev, current, _) => prev + current, 0))
                    .reduce((prev, current, _) => prev + current, 0);
                totals.push(totalEntered);

                var totalDiscount = data
                    .map(g => g.discount)
                    .reduce((prev, current, _) => prev + current, 0);

                tables.push(data.map(g => [g.title, g.numberOfPeople, g.notSelled, (g.numberOfPeople - g.notSelled) * 15 - g.discount]));

                DB[tag + ':shop'].find({}, (err, shopData) => {
                    if (err) cb(err, null);

                    DB['product:products'].find({}, (err, productData) => {
                        if (err) cb(err);

                        shopData.map(p => {
                            p['product'] = _find(productData, p['product']);
                            return p;
                        });

                        var totalShop = shopData
                            .map(p => p.quantity * p.product.price)
                            .reduce((prev, current, _) => prev + current, 0);

                        var tableShop = shopData.map(p => [p.quantity, p.product.shop + ' - ' + p.product.name, p.product.price, p.quantity * p.product.price]);
                        tableShop.sort((p1, p2) => p2[1][0].charCodeAt(0) - p1[1][0].charCodeAt(0));
                        tables.push(tableShop);

                        DB[tag + ':transactions'].find({}, (err, transactionsData) => {
                            if (err) cb(err);

                            transactionsData = [
                                ...transactionsData,
                                {
                                    title: 'Spesa',
                                    amount: -totalShop,
                                    description: '',
                                },
                                {
                                    title: 'Prevendite',
                                    amount: totalEntered * 15,
                                    description: '',
                                },
                                {
                                    title: 'Sconti',
                                    amount: -totalDiscount,
                                    description: '',
                                }
                            ].filter((t, _, __) => t.amount != 0)
                                .sort((a, b) => _abs(b.amount) - _abs(a.amount))
                                .sort((a, b) => (a.amount > 0 ? 0 : 1) - (b.amount > 0 ? 0 : 1));

                            var totalCredit = transactionsData
                                .filter((t, _, __) => t.amount > 0)
                                .map(t => t.amount)
                                .reduce((p, c, _) => p + c, 0);
                            totals.push(totalCredit);

                            var totalDebit = transactionsData
                                .filter((t, _, __) => t.amount < 0)
                                .map(t => t.amount)
                                .reduce((p, c, _) => p + c, 0);
                            totals.push(totalDebit);

                            totals.push(totalCredit + totalDebit);

                            tables.push(transactionsData
                                .map(t => [t.title, t.amount, t.description]));

                            cb(null, {
                                tables: tables,
                                totals: totals,
                                party: party,
                            });
                        });
                    });
                });
            });
        });
    }

    static getDocumentLista(tag, cb) {
        DB['main:parties'].find({}, (err, data) => {
            if (err) cb(err);

            const party = data.filter((p, _, __) => p.tag == tag)[0];

            DB[tag + ":groups"].find({}, (err, data) => {
                if (err) cb(err);

                data.map(g => {
                    g['people'] = g['people'].map(p => {
                        p = JSON.parse(p);
                        p['group'] = g.title;
                        return p;
                    });
                });

                var peoples = [];
                for (let i in data) {
                    peoples = peoples.concat(data[i].people)

                }

                const table = peoples
                    .map(p => [p.group, p.name, p.hasPaid ? 'ok' : '', p.hasEntered ? 'entrato' : '']);

                cb(null, {
                    party: party,
                    table: table
                });
            });
        });

    }
}
