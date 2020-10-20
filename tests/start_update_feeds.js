const path = require('path');

// Bootstrap
const IMPORT_PATH_ROOT      = '../';
const IMPORT_PATH_MODULES   = path.join(IMPORT_PATH_ROOT, 'modules');
const IMPORT_PATH_MODEL     = path.join(IMPORT_PATH_MODULES, 'model');

const config = require( path.join(IMPORT_PATH_ROOT, "config.js") );
const DataBase = require( path.join(IMPORT_PATH_MODEL, "DataBase.js" ) ).DataBase;
const ModelCatalogue = require( path.join(IMPORT_PATH_MODEL, "ModelCatalogue.js" ) ).ModelCatalogue;
const StaticFeed = require(  path.join(IMPORT_PATH_MODULES, "StaticFeed") ).StaticFeed;



async function main() {

    let objDB;

    try {
        objDB = new DataBase(config.db);
    }
    catch (err) {
        console.error("Database connection error: " + err.message);
        return Promise.reject(err);
    }

    const objModelCatalogue = new ModelCatalogue(objDB);
    const objStaticFeed = new StaticFeed(config.feeds_dir_path, objModelCatalogue, objDB);
    let error = undefined;

    try {
        await objStaticFeed.updateСdekYML();
    }
    catch (err) {
        error = err;
    }

    objDB.close().catch(err => {
        console.error(err.message);
        //throw new Error(err);
    });

    if (error)
        return Promise.reject(error);
    else
        return Promise.resolve();

}

main().catch(err => {
    console.error('ERROR', err.message);
});

/*
const update_db = require('../update_db');
const xmlUrl ='http://img.nothingshop.com/tmp/xml_inventory.xml';

update_db.UpdateAllData(xmlUrl).then(
    () => {
        console.log("DB updated");
        console.log("Updating feeds!!!");
        update_feeds().then(
            ()=> console.log("All feed updated"),
            (err) => console.log("Error " + err.message)
        );
    },
    err => {
        console.log("Error " + err.message);
    }
);

 */