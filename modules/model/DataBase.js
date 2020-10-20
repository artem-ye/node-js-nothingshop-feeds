const mysql = require("mysql2");

class DataBase {

    constructor( config ) {

        const connParams = {
            host: config.host,
            user: config.user,
            database:  config.db,
            password: config.pass,
            multipleStatements: true
        };

        //{multipleStatements: true}

        this.connection = mysql.createConnection(connParams);

    }

    escape(str) {
        return this.connection.escape(str);
    }

    async query( sql, args ) {
        return new Promise( ( resolve, reject ) => {
            this.connection.query( sql, args, ( err, rows ) => {
                if ( err )
                    return reject( err );
                resolve( rows );
            } );
        } );
    }

    async insertObject(tbName, obj) {

        return new Promise( ( resolve, reject ) => {

            let sqlFields = '';
            let sqlVals = '';
            let args = [];

            for (let [field, val] of Object.entries(obj)) {
                sqlFields += ","+field;
                sqlVals += ",?";
                args.push(val);
            }

            sqlFields = sqlFields.substr(1);
            sqlVals = sqlVals.substr(1);

            const sql = `INSERT INTO ${tbName} (${sqlFields}) VALUES (${sqlVals})`;
            this.connection.query( sql, args, ( err, rows ) => {
                if ( err )
                    return reject( err );
                resolve( rows );
            } );
        } );
    }

    async execMultiplyQueries( sql, arrOfArgs ) {

        for (let args of arrOfArgs) {

            await this.query(sql, args);

        }

    }

    async close() {
        return new Promise( ( resolve, reject ) => {
            this.connection.end( err => {
                if ( err )
                    return reject( err );
                resolve();
            } );
        } );
    }


}

module.exports.DataBase = DataBase;