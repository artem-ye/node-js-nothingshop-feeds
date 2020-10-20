// APP model modules import
const APP_ROOT_DIR = '../../';
const APP_MODULES_MODEL_DIR = APP_ROOT_DIR+'/modules/model/';
const config = require(APP_ROOT_DIR + "config.js");
const moduleDataBase = require(APP_MODULES_MODEL_DIR + 'DataBase.js');
const moduleModelCatalogue = require(APP_MODULES_MODEL_DIR + 'ModelCatalogue');

// Internal modules import
const ModelSupplyPrices = require('./ModelSupplyPrices');
const ViewSupplyPricesRender = require('./ViewSupplyPricesRender');
const translate = require('./Translation');

// Other modules
const path = require('path');
const fs = require('fs');

// Main
const CATEGORIZED_PRICES_DIR = path.join('/var/www/storage_mersada_trade', 'categorized');
const TOP500_PRICE_DIR = path.join('/var/www/storage_mersada_trade', 'top500');
const PICTURES_DIR_NAME = 'SD900';

async function updateCategoryBasedPrices() {

    // Price lists options
    const FUNC_NAME = 'updateCategoryBasedPrices';
    const PRODUCTS_PER_CATEGORY_LIMIT = 250;
    const PICTURE_DIR_NAME = PICTURES_DIR_NAME;

    // Paths
    const PRICES_DIR = CATEGORIZED_PRICES_DIR;
    const TMP_DIR = path.join(PRICES_DIR, '.tmp');

    ///////////////////////////////////////////////////////////////////////////
    // File system directories initialization

    // Check if PRICES_DIR exists
    if (! fs.existsSync(PRICES_DIR)) {

        if (! fs.existsSync(path.dirname(PRICES_DIR))) {
            let msg = `Price list dir ${PRICES_DIR} not created. Parent dir ${path.dirname(PRICES_DIR)} not exists.`;
            throwException(FUNC_NAME, msg);
        }

        try {
            fs.mkdirSync(PRICES_DIR)
        }
        catch (e) {
            throwException(FUNC_NAME, `Unable to create price-list dir ${PRICES_DIR}. Error: ${e.message}`);
        }

    }

    // Clear temp dir, if exists
    if (fs.existsSync(TMP_DIR)) {
        try {
            fs.rmdirSync(TMP_DIR, {recursive: true});
        }
        catch (e) {
            throwException(FUNC_NAME, `Unable to delete tmp dir ${TMP_DIR}. Err ${e.message}`);
        }
    }

    try {
        fs.mkdirSync(TMP_DIR);
    }
    catch (e) {
        throwException(FUNC_NAME, `Unable to create tmp dir ${TMP_DIR}. Err ${e.message}`);
    }

    ///////////////////////////////////////////////////////////////////////////
    // Creating new price list files into TMP_DIR

    // Initialization
    const modelDB = new moduleDataBase.DataBase(config.db);
    const modelCatalogue = new moduleModelCatalogue.ModelCatalogue(modelDB);
    const modelSupplyPrices = new ModelSupplyPrices(modelCatalogue);

    await modelSupplyPrices.createCategoryBasedPrices(PICTURE_DIR_NAME,
    async function (priceData) {

        // Translate ru title
        let priceTitle = priceData.title;
        try {
            priceTitle = await translate(priceTitle);
        }
        catch (e) {
            console.error('Unable to translate category title. Error:', e.message);
        }


        // Trying to translate material
        for (let i =0; i < priceData.products.length; i++) {

            priceData.products[i].material = await translate(priceData.products[i].material).catch(e =>{
               console.error('Translation error', e.message);
            });

        }

        // Split query results into parts of PRODUCTS_PER_CATEGORY_LIMIT sku
        let arrProducts = priceData.products.slice();
        let arrProductsLength = arrProducts.length;
        let productSliceNum = 1;
        let productSliceCount = arrProducts.length / PRODUCTS_PER_CATEGORY_LIMIT;

        if (productSliceCount != Math.floor(productSliceCount))
            productSliceCount =  Math.floor(productSliceCount) + 1;

        while (arrProducts.length > 0) {

            priceData.products = arrProducts.splice(0, PRODUCTS_PER_CATEGORY_LIMIT);

            let pdfFilePath = `${priceTitle} ${arrProductsLength} sku pt ${productSliceNum} of ${productSliceCount}`;
            pdfFilePath = pdfFilePath.replace(/[^a-zA-Zа-яА-Я0-9_ ]+/g, "-");
            pdfFilePath = path.join(TMP_DIR, pdfFilePath+'.pdf');


            await ViewSupplyPricesRender.renderPdfPrice(priceData, pdfFilePath).catch(err => {
                throw err;
            });

            productSliceNum++;
        }

    }).catch(err => {
        modelDB.close().catch(err => {console.log('Unable to close DB')});
        throw err;
    });

    modelDB.close().catch(err => {console.log('Unable to close DB')});

    ///////////////////////////////////////////////////////////////////////////
    // Replace price lists

    // Remove old prices
    try {
        fs.readdirSync(PRICES_DIR).forEach(fileName => {
            let filePath = path.join(PRICES_DIR, fileName);

            if (!fs.lstatSync(filePath).isDirectory())
                fs.unlinkSync(path.join(PRICES_DIR, fileName));
        });
    }
    catch (e) {
        throwException(FUNC_NAME, `Unable to clear price-list dir ${PRICES_DIR}. Err: ${e.message}`);
    }

    // Move new prices form TMP_DIR to PRICES_DIR, clear temp
    try {
        fs.readdirSync(TMP_DIR).forEach(fileName => {
            let src = path.join(TMP_DIR, fileName);
            let dst = path.join(PRICES_DIR, fileName);
            fs.renameSync(src, dst);
        });

        fs.rmdirSync(TMP_DIR, {recursive: true});
    }
    catch (e) {
        throwException(FUNC_NAME, `Unable to move price-list files from ${TMP_DIR} to ${PRICES_DIR}. 
        Err: ${e.message}`);
    }

}

async function updateTop500Price() {

    // Price lists options
    const FUNC_NAME = 'updateTop500Price';
    const PICTURE_DIR_NAME = PICTURES_DIR_NAME;
    const TOP_LIMIT = 500;

    // Paths
    const PRICES_DIR = TOP500_PRICE_DIR;
    const PRICE_FILE_NAME = 'TOP-'+TOP_LIMIT+'.pdf';
    const PRICE_FILE_PATH = path.join(PRICES_DIR, PRICE_FILE_NAME);
    const TMP_PRICE_FILE_PATH = path.join(PRICES_DIR, '.tmp-'+PRICE_FILE_NAME);

    ///////////////////////////////////////////////////////////////////////////
    // File system directories initialization

    // Check if PRICES_DIR exists
    if (! fs.existsSync(PRICES_DIR)) {

        if (! fs.existsSync(path.dirname(PRICES_DIR))) {
            let msg = `Price list dir ${PRICES_DIR} not created. Parent dir ${path.dirname(PRICES_DIR)} not exists.`;
            throwException(FUNC_NAME, msg);
        }

        try {
            fs.mkdirSync(PRICES_DIR)
        }
        catch (e) {
            throwException(FUNC_NAME, `Unable to create price-list dir ${PRICES_DIR}. Error: ${e.message}`);
        }

    }

    if (fs.existsSync(TMP_PRICE_FILE_PATH)) {

        try {
            fs.unlinkSync(TMP_PRICE_FILE_PATH);
        }
        catch (e) {
            throwException(FUNC_NAME, `Unable to delete old tmp price file ${TMP_PRICE_FILE_PATH}. ${e.message}`);
        }

    }

    ///////////////////////////////////////////////////////////////////////////
    // Creating new price list files into TMP_DIR

    // Initialization
    const modelDB = new moduleDataBase.DataBase(config.db);
    const modelCatalogue = new moduleModelCatalogue.ModelCatalogue(modelDB);
    const modelSupplyPrices = new ModelSupplyPrices(modelCatalogue);

    let error = undefined;

    await modelSupplyPrices.createTopNPrices(TOP_LIMIT , PICTURE_DIR_NAME, async (data) =>{

        data.title = 'TOP 500';

        for (let i=0; i<data.products.length; i++) {
            data.products[i].material = await translate(data.products[i].material).catch(err => {
               console.error('TOP 500 Price: Translation error', err.message);
            });
        }

        await ViewSupplyPricesRender.renderPdfPrice(data, TMP_PRICE_FILE_PATH).catch(err => {
            error = err;
        });

    }).catch(err => {
        error = err;
    });

    modelDB.close().catch(err => {
        console.log(FUNC_NAME, 'ERROR. Unable to close DB connection', err.message);
    });

    if (error) {
        throwException(FUNC_NAME, error.message);
    }

    try {
        fs.renameSync(TMP_PRICE_FILE_PATH, PRICE_FILE_PATH);
    }
    catch (e) {
        throwException(FUNC_NAME, `Unable to rewrite file ${PRICE_FILE_PATH}. Error: ${e.message}`);
    }

}

function throwException(funcName, msg) {

    const ERR_PREFIX = 'ControllerSupplyPrices';
    throw new Error(`${ERR_PREFIX}::${funcName} ERROR: ${msg}`);

}

async function updateAllPrices() {

    updateCategoryBasedPrices().catch(err => {
        console.error('ERR!!! Unable to update prices', err.message);
    });

    updateTop500Price().catch(err => {
        console.error('ERR!!! Unable to update TOP 500 prices', err.message);
    });

}

// updateAllPrices();

module.exports.updateAllPrices = updateAllPrices;
//module.exports.updateCategoryBasedPrices = updateCategoryBasedPrices();
module.exports.updateTop500Price = updateTop500Price;




