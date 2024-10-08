const fs = require('fs');
const { Data } = require('./database');
const archiver = require('archiver');

module.exports = {
    async make_backup() {
        const filename = `backup_${new Date().toJSON().split('T')[0]}.zip`
        const target = fs.createWriteStream(filename);
        const archive = archiver('zip');

        target.on('close', () => {
            console.log(`BAKCUP     Backup completed, ${archive.pointer() / 1024} MB`)

            Data.insert('main:backups', {
                '_id': new Date().toJSON().split('T')[0],
                'date': new Date(),
                'filename': `${new Date().toJSON().split('T')[0]}.zip`,
                'size': archive.pointer()
            }, (err, _, __) => console.error(err));
        });

        archive.pipe(target);
        archive.directory('data', false);
        await archive.finalize();
    }
}