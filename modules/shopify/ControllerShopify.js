// Bootstrap
const projectRootDir = '../../';
const projectModelModulesDir = projectRootDir+'/modules/model/';

const config = require(projectRootDir + "config.js");
const moduleDataBase = require(projectModelModulesDir + 'DataBase.js');
const moduleModelCatalogue = require(projectModelModulesDir + 'ModelCatalogue');

// Moudule
let ModelShopify = require('./ModelShopify');

function createObjectShopify() {

    let modelDB = new moduleDataBase.DataBase(config.db);
    let modelCatalogue = new moduleModelCatalogue.ModelCatalogue(modelDB);
    let objShopify = new ModelShopify(modelCatalogue, config.shopifyApiCredentials);

    return objShopify;

}

const syncAllData = async function () {

    let objShopify;

    try {
        objShopify = createObjectShopify();
    } catch (e) {
        throw e;
    }

    objShopify.syncAllData().then(_ => {
        objShopify.db.close().catch(err => {
           console.log('Unable to close db.', err.message);
        });
    }).catch(err => {
       console.log('ERROR', err.message);
       throw err;
    });

}

const test = async function() {

    let objShopify;
    
    try {        
        objShopify = createObjectShopify();        
    } catch (e) {        
        throw e;
    }
    
    objShopify.test().then(_ => {
        objShopify.db.close().catch(err => {
            console.log('Unable to close db.', err.message);
        });
    }).then(
        ok  => {console.log("Test passed")},
        err => {throw err}
    );               

}

module.exports.syncAllData = syncAllData;
module.exports.test = test;