const PDFDocument = require("pdfkit");
const { createWriteStream } = require("fs");

exports.Document = class {
    constructor(limit = 650, font = 'Helvetica') {
        this.font = font;
        this.doc = new PDFDocument({font: this.font, margins: {bottom: 0} });
        this.pos = 0;
        this.limit = limit;
    }

    header(logo, title, party, date) {
        this.doc
            .image(logo, 20, this.pos + 20, { width: 70, height: 70 })
            .fontSize(25)
            .fillColor('#444444')
            .font(`${this.font}-Bold`)
            .text(title, 100, this.pos + 40)
            .fontSize(10)
            .font(this.font)
            .text(party, 0, this.pos + 43.75, {
                width: this.doc.page.width - 30,
                align: 'right',
            })
            .text(date, 0, this.pos + 58.75, {
                width: this.doc.page.width - 30,
                align: 'right'
            });

        this.pos += 80;
        return this;
    }

    table(table) {
        if (this.pos >= 500) {
            this.doc
                .addPage()
                .fillColor('#444444');
            this.pos = 0;
        }

        this._tableHeader(table);

        for (let i in table.rows) {
            if (this._checkPage()) this._tableHeader(table);
            

            this._tableRow(table.columns, table.rows[i]);
        }

        this.pos += 3
        this._line();
        this._tableTotal(table.columns, table.rows);

        return this;
    }

    summary(summary) {
        this.pos += 30
        this.doc
            .fontSize(20)
            .text("Riepilogo", 30, this.pos);

        this._space(25)
            ._line()
            ._space(5);

        this.doc
            .fontSize(10)
            .text("Prevendite vendute:", 30, this.pos)
            .text(summary.prevendite, 30, this.pos, {width: 150, align: 'right'})
            .text("Persone entrate:", 30, this.pos + 15)
            .text(summary.entered, 30, this.pos + 15, {width: 150, align: 'right'})
            .text("Totale entrate:", 30, this.pos + 30)
            .text(this._currencyFormat(summary.credit), 30, this.pos + 30, {width: 150, align: 'right'})
            .text("Totale spese:", 30, this.pos + 45)
            .text(this._currencyFormat(summary.debit), 30, this.pos + 45, {width: 150, align: 'right'})
            .fontSize(20)
            .font(`${this.font}-Bold`)
            .text(`Guadagno: ${this._currencyFormat(summary.balance)}`, 180, this.pos + 15, {width: this.doc.page.width - 170, align: 'center'})
            .font(this.font);
        
        this._space(60)
            ._line()
            ._space(3)
            ._line();
        return this;
    }

    footer(balance = NaN) {
        this.pos = this.doc.page.height - 80;
        this._line(this.doc.page.width - 280)
            ._space(5);

        if (!Number.isNaN(balance)) {
            this.doc
            .font(`${this.font}-Bold`)
            .fontSize(12)
            .text(`Saldo attuale in cassa:  ${this._currencyFormat(balance)}`, 0, this.pos, {
                width: this.doc.page.width - 30,
                align: 'right'
            })
            .font(this.font)
            .fontSize(10)

            this._space(20);
        }
        
        var now = Intl.DateTimeFormat('it-IT', {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }).format(Date.now());
        
        this.doc
            .text(`Creato il ${now}`, 0, this.pos, {
                width: this.doc.page.width - 30,
                align: 'right'
            })
            .text('Curta Events', 0, this.pos + 15, {
                width: this.doc.page.width - 30,
                align: 'right'
            });
            
        this._space(35);
        return this;
    }

    _tableHeader(table) {
        this.doc
            .fontSize(20)
            .text(table.title, 30, this.pos + 30)
            .fontSize(10);

        this._space(55)
            ._line()
            ._space(5)
            ._tableRowHeader(table.columns)
            ._space(15)
            ._line();
        
        return this;
    }

    _space(yspace) {
        this.pos += yspace;
        return this;
    }

    _checkPage() {
        if (this.pos >= this.limit) {
            this.doc
                .addPage()
                .fillColor('#444444');

            this.pos = 0;
            return true;
        }

        return false;
    }

    _line(xstart = 30) {
        this.doc
            .strokeColor("#aaaaaa")
            .lineWidth(1)
            .moveTo(xstart, this.pos)
            .lineTo(this.doc.page.width - 30, this.pos)
            .stroke();

        return this
    }

    _tableRowHeader(columns) {
        this.doc.fontSize(10).font(`${this.font}-Bold`);

        var totalWidth = this.doc.page.width - 60;
        var totalFlex = 0;
        for (var i in columns) {
            totalFlex += columns[i].flex || 1;
        }
        for (var i in columns) {
            columns[i].width = (columns[i].flex || 1) * totalWidth / totalFlex;
        }

        var xpos = 30;
        for (var i in columns) {
            var options = {};
            
            if (columns[i].numeric || columns[i].currency) {
                options['width'] = columns[i].width - 15;
                options['align'] = 'right';
            }

            if (columns[i].center) {
                options['width'] = columns[i].width;
                options['align'] = 'center';
            }

            this.doc.text(columns[i].name, xpos, this.pos, options);
            xpos += columns[i].width;
        }

        this.doc.font(this.font);
        return this;
    }

    _tableRow(columns, row, noLine = false) {
        this.pos += 5;
        
        var xpos = 30;
        for (let i in columns) {
            var options = {};

            if (columns[i].numeric || columns[i].currency) {
                options['width'] = columns[i].width - 15;
                options['align'] = 'right'
            } 

            if (columns[i].center) {
                options['width'] = columns[i].width;
                options['align'] = 'center';
            }

            var text;
            if (columns[i].currency) {
                text = this._currencyFormat(Number(row[i]));
            } else {
                text = row[i]
            }

            this.doc.text(text, xpos, this.pos, options);
            xpos += columns[i].width;
        }
        this.pos += 15;
        if (!noLine) this._line();
        return this;
    }

    _tableTotal(columns, rows) {
        var colID = -1;
        for(let i in columns) {
            if (columns[i].total) {
                colID = i;
            }
        }
        if (colID < 0) return;

        var total = 0;
        for (let i in rows) {
            total += Number(rows[i][colID]);
        }

        var rowTotal = [];
        for (let i in columns) {
            if (i == colID) {
                rowTotal[i] = total
            }
        }
        this.doc.font(`${this.font}-Bold`);
        this._tableRow(columns, rowTotal, true);
        this.doc.font(this.font);
    }

    _currencyFormat(amount) {
        if (Number.isNaN(amount)) return ""

        return amount.toFixed(2) + " €"
    }

    save(file) {
        this.doc.pipe(createWriteStream(file));
        this.doc.end();
    }

    pipe(stream) {
        this.doc.pipe(stream);
        this.doc.end();
    }
}

exports.DEFAULT_COLUMNS = [
    [
        { name: 'Quantità', center: true, flex: 1 },
        { name: 'Prodotto', flex: 4 },
        { name: 'Prezzo unitario', currency: true, flex: 2 },
        { name: 'Prezzo totale', currency: true, total: true, flex: 2 }
    ],
    [
        { name: 'Gruppo', },
        { name: 'Prevendite', center: true },
        { name: 'Invendute', center: true },
        { name: 'Guadagno', currency: true, total: true }
    ],
    [
        { name: 'Titolo', flex: 1 },
        { name: 'Importo', flex: 1, currency: true, total: true },
        { name: 'Descrizione', flex: 3 }
    ],
    [
        { name: 'Gruppo' },
        { name: 'Nome' },
        { name: 'Pagamento', center: true },
        { name: 'Entrata', center: true }
    ]
];