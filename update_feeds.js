// Bootstrap
const config = require("./config.js");
const DataBase = require("./modules/model/DataBase.js").DataBase;
const ModelCatalogue = require('./modules/model/ModelCatalogue').ModelCatalogue;
const StaticFeed = require("./modules/StaticFeed").StaticFeed;

const fnMain = async function main() {
let objDB;

    try {
        objDB = new DataBase(config.db);
    }
    catch (err) {
        console.log("Database connection error: " + err.message);
        return Promise.reject(err);
    }

    const objModelCatalogue = new ModelCatalogue(objDB);
    const objStaticFeed = new StaticFeed(config.feeds_dir_path, objModelCatalogue, objDB);
    await objStaticFeed.updateFeeds();
    objDB.close();
}

module.exports = fnMain;