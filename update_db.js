// Bootstrap
const config = require("./config.js");
const db = require("./modules/model/DataBase.js");
const moduleModelCatalogue = require('./modules/model/ModelCatalogue');

// XML parser
//const fs = require('fs');
const xml2js = require('xml2js');
const request = require('request');

/****************************************************************
 * Main algorithm
 ****************************************************************/

async function updateDbCategories(DB, objCatalogue, arrInboundCategories) {

    // We must keep categories hierarchy
    // so we will use tree to do this
    // mapping flat category array to tree
    let treeInboundCategories = categoriesArrayToTree(arrInboundCategories);

    // Fetching db categories
    let sqlRowsCategories = await DB.query(`SELECT * from ${objCatalogue.dbTables.categories}`);
    let treeDbCategories = categoriesArrayToTree(sqlRowsCategories);

    // Removing invalid db categories, that was not been listed in XML file
    await (async function findInvalidBdCatsRecursive(arrDbCatTree, arrInboundCatTree) {

        for (let dbCat of arrDbCatTree) {

            let res = arrInboundCatTree.find( el => el.title == dbCat.title);

            if (res) {
                await findInvalidBdCatsRecursive(dbCat.sub_items, res.sub_items);
            }
            else {
                console.log("Deleting category: " + dbCat.title);
                objCatalogue.deleteCategory(dbCat.id).catch(err => {
                    console.log("SQL DELETE category ERR " + JSON.stringify(dbCat));
                    console.log(err.message);

                });

            }
        }

    }) (treeDbCategories, treeInboundCategories);

    // Adding new categories to db
    // and map its id's to arrInboundCategories (function result)
    await (async function mapDbCategoriesRecursive(arrInboundCatTree, arrDbCatTree, db_parent_id=undefined)  {

        for (let inCat of arrInboundCatTree) {

            let findRes = arrDbCatTree.find(el => el.title == inCat.title);

            if (findRes) {
                inCat.db_id = findRes.id;
                inCat.db_parent_id = findRes.parent_id;
            } else {

                let res = await objCatalogue.insertCategory(inCat.title, db_parent_id).catch(err => {
                    console.log("SQL INSERT category ERR " + inCat.title + " " + db_parent_id);
                    console.log(err.message);
                });

                console.log("New category " + inCat.title + " " + res.insertId);

                inCat.db_id = res.insertId;
                inCat.db_parent_id = db_parent_id;
            }

            // Mapping db ids to arrInboundCategories
            let elArrInboundCategories = arrInboundCategories.find(el => el.id == inCat.id);
            elArrInboundCategories.db_id = inCat.db_id;
            elArrInboundCategories.db_parent_id = inCat.db_parent_id;

            await mapDbCategoriesRecursive(inCat.sub_items,  (!findRes ? [] : findRes.sub_items), inCat.db_id);
        }

    }) (treeInboundCategories, treeDbCategories);

    await objCatalogue.updateCategoryLevels();
    return arrInboundCategories;
}

async function updateProducts(DB, objCatalogue, xmlProducts, arrMapedCategories) {

    const SKU_PER_ITERATION_LIMIT = 100;
    const xmlProductFieldsAssoc = {
        sku: 'vendorCode',
        title: 'name',
        description: 'description',
        vendor: 'vendor',
        weight: 'weight',
        volume: 'volume',
        material: 'material',
        wash: 'wash',
        sex: 'sex',
        type: 'type',
        target_audience: 'target_audience'
    };
    const xmlProductVariantFieldsAssoc = {
        color: 'color',
        size: 'size',
        barcode: 'barcode',
        ru_price: 'price',
        ru_inventory_qty: 'availability',
        ru_discount_percent: 'discount_percent',
        ru_price_with_discount: 'price_with_discount',
        not_supplied: 'not_supplied'
    };

    // We well use sql tmp table to store incoming sku
    // and associated db product ids
    let sql = `
    CREATE TEMPORARY TABLE incoming_sku (
        product_id INT DEFAULT NULL,
        sliceStepIdx INT,
        sku VARCHAR (10)
    )`;
    DB.query(sql);

    const xmlProductsLength = xmlProducts.length;
    let sliceStepSize = SKU_PER_ITERATION_LIMIT;
    let sliceStepEndIdx = Math.ceil(xmlProductsLength / sliceStepSize);

    // Processing incoming data by slices
    for (let sliceStepIdx=1; sliceStepIdx <= sliceStepEndIdx; sliceStepIdx++) {

        let startIdx = sliceStepIdx*sliceStepSize - sliceStepSize;
        let endIdx = Math.min(sliceStepIdx*sliceStepSize, xmlProductsLength)-1;

        console.log("Processing products Slice " + sliceStepIdx + " of "+sliceStepEndIdx+ " start idx " + startIdx + " end idx " + endIdx + "...");

        for (let el of xmlProducts.slice(startIdx, endIdx)) {
            let sku = el[xmlProductFieldsAssoc.sku].trim();

            if (sku != '') {
                sql = `INSERT INTO incoming_sku (sku, sliceStepIdx, product_id) VALUES (?, ?, NULL)`;
                await DB.query(sql, [sku, sliceStepIdx] );
            }
        }

        /*
        await xmlProducts.slice(startIdx, endIdx).forEach(async function(el)  {
            let sku = el[xmlProductFieldsAssoc.sku].trim();

            if (sku != '') {
                sql = `INSERT INTO incoming_sku (sku, sliceStepIdx, product_id) VALUES (?, ?, NULL)`;
                await DB.query(sql, [sku, sliceStepIdx] );
            }
        });
         */

        sql = `
        UPDATE incoming_sku 
            JOIN ${objCatalogue.dbTables.products} 
            ON (incoming_sku.sliceStepIdx = ? AND incoming_sku.sku  = products.sku) 
        SET incoming_sku.product_id = products.id`;
        await DB.query(sql, sliceStepIdx);

        // DB products
        sql = `
        SELECT * FROM ${objCatalogue.dbTables.products}
        WHERE id IN (SELECT product_id FROM incoming_sku WHERE sliceStepIdx = ? AND NOT product_id IS NULL)`;
        let dbProducts = await DB.query(sql, sliceStepIdx);

        // DB products variants
        sql = `
        SELECT * FROM ${objCatalogue.dbTables.product_variants}
        WHERE product_id IN (SELECT product_id FROM incoming_sku WHERE sliceStepIdx = ? AND NOT product_id IS NULL)`;
        let dbProductsVariants = await DB.query(sql, sliceStepIdx);

        // DB product pictures
        sql = `
        SELECT * FROM product_pictures 
        WHERE product_id IN (SELECT product_id FROM incoming_sku WHERE sliceStepIdx = ? AND NOT product_id IS NULL)`;
        let dbProductsPrictures = await DB.query(sql, sliceStepIdx);

        // DB products categories
        sql = `
        SELECT * FROM ${objCatalogue.dbTables.product_categories}
        WHERE product_id IN (SELECT product_id FROM incoming_sku WHERE sliceStepIdx = ? AND NOT product_id IS NULL)`;
        let dbProductsCategories = await DB.query(sql, sliceStepIdx);
        let xmlSlice = xmlProducts.slice(startIdx, endIdx);

        for (let idx in xmlSlice) {

            let xmlProd = xmlSlice[idx];
            let product_sku = xmlProd[xmlProductFieldsAssoc.sku].trim();

            //if (product_sku != '292166') continue;

            if (product_sku != '')  {

                let incomingProduct = {};

                for(let [dbPropName, xmlPropName] of Object.entries(xmlProductFieldsAssoc)) {
                    incomingProduct[dbPropName]  = xmlProd[xmlPropName];

                    if (dbPropName == 'title')
                        incomingProduct['title'] = incomingProduct['title'].slice(0, 254);
                    else if (dbPropName == 'weight')
                        incomingProduct['weight'] = incomingProduct['weight'].replace(",", ".");
                }

                // ************************************************************************
                // Mapping XML product variants
                let incomingProductVariants = [];
                let xmlProdVariants         = xmlProd.variants.variant;

                if (!xmlProdVariants)
                    xmlProdVariants = [];
                else if (! Array.isArray(xmlProdVariants))
                    xmlProdVariants = [xmlProdVariants];

                xmlProdVariants.forEach(el => {
                    let incomingVariant = {};

                    for(let [dbPropName, xmlPropName] of Object.entries(xmlProductVariantFieldsAssoc)) {
                        incomingVariant[dbPropName]  = el[xmlPropName];

                        if (dbPropName == 'ru_price')
                            incomingVariant[dbPropName] = incomingVariant[dbPropName].replace(",", ".");
                    }

                    incomingProductVariants.push(incomingVariant);
                });

                // ************************************************************************
                // Updating existing product and its variants
                let dbProd = await dbProducts.find(el => el.sku == product_sku);
                if (dbProd) {

                    let productId = dbProd.id;

                    for(let [propName, propVal] of Object.entries(incomingProduct)) {
                        if (propVal != dbProd[propName]) {
                            console.log("Updating product " + product_sku);
                            await objCatalogue.updateProductById(incomingProduct, dbProd.id);
                        }
                    }

                    // Deleting product variants, that was not listed in xml
                    let dbVariants = dbProductsVariants.filter(el => el.product_id == productId );
                    dbVariants.forEach(elDbVar => {

                        if(! incomingProductVariants.find(el => el.barcode == elDbVar.barcode) ) {
                            console.log("Deleting variant " + product_sku );
                            objCatalogue.deleteProductVariant(elDbVar.id);
                        }

                    });

                    // INSERT / UPDATE
                    incomingProductVariants.forEach(inProdVariant => {
                        let dbProdVariant = dbProductsVariants.find(el => el.barcode == inProdVariant.barcode);

                        if (dbProdVariant) {

                            for(let [propName, propVal] of Object.entries(inProdVariant)) {
                                if (propVal != dbProdVariant[propName]) {

                                    objCatalogue.updateProductVariantById(inProdVariant, dbProdVariant.id).catch(err =>
                                        console.log("Product variant UPDATE err. Slice id "+sliceStepIdx+" SKU " + product_sku
                                            + " " +JSON.stringify(inProdVariant) + " " + err.message)
                                    );
                                    break;
                                }
                            }

                        } else {

                            // insert
                            objCatalogue.insertProductVariant(inProdVariant, productId).catch(err =>
                                console.log("Product variant INSERT err. Slice id "+sliceStepIdx+" SKU " + product_sku
                                    + " " +JSON.stringify(inProdVariant) + " " + err.message)
                            );

                        }

                    });

                    incomingProduct['id'] = productId;

                }
                else {
                    // New product
                    try {
                        let res = await objCatalogue.insertProduct(incomingProduct);
                        incomingProduct.id = res.insertId;
                    }
                    catch (err) {
                        console.log("New product INSERT err. " + sliceStepIdx+" SKU " + product_sku + " " +JSON.stringify(incomingProduct) + " " + err.message);
                        continue;
                    }

                    for (let el of incomingProductVariants) {
                        objCatalogue.insertProductVariant(el, incomingProduct.id).catch(err =>
                            console.log("Insert err: SKU " + product_sku + " " +JSON.stringify(el) + " " + err.message)
                        );
                    }
                }

                let product_id = incomingProduct.id;

                // ************************************************************************
                // Updating product pictures
                let xmlProdPictures = (Array.isArray(xmlProd.pictures) ? xmlProd.pictures : [xmlProd.pictures] );
                let xmlProdPicturesMaped = [];

                xmlProdPictures.forEach(elCatalogue => {

                    let arrPics = (Array.isArray(elCatalogue.picture) ? elCatalogue.picture : [elCatalogue.picture]);

                    arrPics.forEach(elPicture =>
                        xmlProdPicturesMaped.push({
                            directory: elCatalogue.$.catalogue,
                            uri: elPicture,
                            id: undefined,
                            product_id: product_id
                        })
                    )

                });

                dbProductsPrictures.filter(el => el.product_id == product_id).forEach(dbPicture => {
                    let res = xmlProdPicturesMaped.find(elXmlPicture => elXmlPicture.directory == dbPicture.directory && elXmlPicture.uri == dbPicture.uri);

                    if (res)
                        res.id = dbPicture.id;
                    else {
                        console.log("Removing picture " + product_sku + " " + dbPicture.directory + " " + dbPicture.uri);
                        objCatalogue.deleteProductPicture(dbPicture.id).catch(
                            err => {
                                console.log("Delete error." + dbPicture.uri + " " + err.message);
                            }
                        );
                    }

                });

                for (let newPicture of xmlProdPicturesMaped.filter(el => el.id === undefined)) {
                    console.log("Adding new picture " + product_sku + " " + newPicture.directory + " " + newPicture.uri);
                    delete newPicture.id;
                    objCatalogue.insertProductPicture(newPicture, product_id).catch(
                        err => {
                            console.log("Insert error." + JSON.stringify(newPicture) + " " + err.message);
                        }
                    );
                }

                // ************************************************************************
                // Updating product categories
                let categoriesUpdated = false;
                let xmlProdCategories = xmlProd.categories.category;

                if (!xmlProdCategories)
                    xmlProdCategories = [];
                else if (! Array.isArray(xmlProdCategories))
                    xmlProdCategories = [xmlProdCategories];

                // Mapping xml category ids to db categories
                xmlProdCategories = xmlProdCategories.map(xmlProdCatId => {
                    let mapedCategory = arrMapedCategories.find(elMappedCategory => elMappedCategory.id == xmlProdCatId);
                    return {
                        id: xmlProdCatId,
                        category_id: mapedCategory.db_id
                    }
                });

                let dbProdCategories = dbProductsCategories.filter(el => el.product_id == product_id);

                /*
                if (product_sku == '292166') {
                    console.log('**************************************************');
                    console.log('DEBUG', 'SKU', product_sku, 'ID', product_id);
                    console.log('DB Categories', dbProdCategories);
                    console.log('XML Categories', xmlProdCategories);
                }
                 */

                // Removing invalid product categories
                for (let dbProdCat of dbProdCategories) {
                    if (! xmlProdCategories.find(e => e.category_id == dbProdCat.category_id)) {
                        console.log("Removing product forom " + product_sku + " cat " + dbProdCat.category_id);
                        objCatalogue.deleteProductFromCategory(dbProdCat.id);
                        categoriesUpdated = true;
                    }
                }

                // Adding new categories
                for (let xmlProdCat of xmlProdCategories) {
                    //if (!dbProductsCategories.find(e => e.category_id == xmlProdCat.category_id) ) {
                    if (!dbProdCategories.find(e => e.category_id == xmlProdCat.category_id) ) {
                        console.log("Adding product  " + product_sku + " to cat " + xmlProdCat.category_id);
                        objCatalogue.addProductToCategory(product_id, xmlProdCat.category_id);
                        categoriesUpdated = true;
                    }

                }

                //throw new Error('break');
            }

        }

    }

    sql = `
    DELETE FROM products
    WHERE id IN (
        SELECT * 
        FROM (
            SELECT id FROM products WHERE NOT id IN (SELECT product_id FROM incoming_sku) 
        ) AS t 
    )`;
    DB.query(sql).catch(err =>
        console.log(err.message)
    );


    console.log("exiting");
    return Promise.resolve();

}

/****************************************************************
 * Mapping service methods
 ****************************************************************/

function mapXmlInventoryProductVariantsProps(xmlProductVariant) {

    // Assoc vocabulary:
    //  key - bd property name
    //  val - xml property name
    const xmlProductVariantFieldsAssoc = {
        color: 'color',
        size: 'size',
        barcode: 'barcode',
        ru_price: 'price',
        ru_inventory_qty: 'availability',
        ru_price_with_discount: 'price_with_discount',
        ru_discount_percent: 'discount_percent',
        not_supplied: 'not_supplied'
    };

    let retVal = new Array();
    let arrXmlProdVariants = (Array.isArray(xmlProductVariant)) ? xmlProductVariant : new Array(xmlProductVariant);

    arrXmlProdVariants.forEach(el => {
        let mappedVariant = {};

        for(let [dbPropName, xmlPropName] of Object.entries(xmlProductVariantFieldsAssoc)) {

            if (el[xmlPropName] == undefined) continue;

            mappedVariant[dbPropName]  = el[xmlPropName];

            if (dbPropName == 'ru_price')
                mappedVariant[dbPropName] = mappedVariant[dbPropName].replace(",", ".");
        }

        retVal.push(mappedVariant);
    });

    return retVal;

}


/****************************************************************
 * Service methods
 ****************************************************************/

async function httpGet(url) {

    return new Promise((resolve, reject) => {

        request.get(url, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                resolve(body);
            } else {
                let msg = "Download err. URL: " + url;

                if (error)
                    msg += " " + error.message;

                reject(new Error(msg));
            }
        });

    });
}

async function parseXml(xmlData) {

    const parser = new xml2js.Parser({explicitArray: false});

    return new Promise( (resolve, reject) => {

        parser.parseString(xmlData, (err, result) => {

            if (err) {
                console.log("!!! READ ERROR !!! " + err);
                return reject(err);
            }

            resolve(result);
        }); // parser.parseString

    } );

}

function categoriesArrayToTree(arrCategories) {

    return arrCategories
        .filter(item => !item.parent_id )
        .map(function fillSubcategoriesRecursive(item) {

            item.sub_items = [];

            for (let subItem of arrCategories.filter(sItem => sItem.parent_id == item.id)) {
                item.sub_items.push(subItem);
                fillSubcategoriesRecursive(subItem);
            }

            return item;
        }
    );

}

function createLogger(funcName) {

    return (...msg) => {
        console.log('update_db.js::'+funcName,  ...msg);
    }

}




/* dev debug */

/*
async function readXmlPromise(path) {

    const parser = new xml2js.Parser({explicitArray: false});

    return new Promise( (resolve, reject) => {

        fs.readFile(path, (err, data) => {

            parser.parseString(data, (err, result) => {

                if (err) {
                    console.log("!!! READ ERROR !!! " + err);
                    return reject(err);
                }

                resolve(result);
            }); // parser.parseString


        }); // fs.readFile

    } );

}
*/

/****************************************************************
 * MAIN
 ****************************************************************/

const fnUpdateInventoryData = async function(xmlUrl) {
let xmlData, arrXmlProducts;

    let starTimeLap = Date.now();
    let strErrMsgPrefix = 'ERR!!! update_db::UpdateInventoryData ';

    try {
        console.log("Downloading "+xmlUrl+" ...");
        xmlData = await httpGet(xmlUrl);
    } catch (err){
        let msg = strErrMsgPrefix + " XML download error. " + err.message;
        throw new Error(msg);
    }

    try {
        console.log("Parsing XML ...");
        xmlData = await parseXml(xmlData);
    } catch (err){
        let msg = strErrMsgPrefix + " XML parsing error. " + err.message;
        throw new Error(msg);
    }

    // Validate XML structure
    try {
        arrXmlProducts = xmlData.shop.products.product;
    }
    catch (err) {
        let msg = strErrMsgPrefix + " XML file has wrong format. Path shop.products.product not found.";
        throw new Error(msg);
    }

    if (! Array.isArray(arrXmlProducts) ) {
        arrXmlProducts = new Array(arrXmlProducts);
    }

    console.log(`Products inventory data update started. Products qty: ${arrXmlProducts.length}`);

    // Mapping XML data
    let arrMppedData = [];

    for (let elProd of arrXmlProducts) {

        if (elProd.variant == undefined){
            console.log(strErrMsgPrefix + " SKU " + elProd.sku + " variant not found");
            continue;
        }

        let prodVariants = mapXmlInventoryProductVariantsProps(elProd.variant);
        prodVariants.forEach(el => arrMppedData.push(el));
    }

    // Updating
    const DB = new db.DataBase(config.db);
    const objCatalogue = new moduleModelCatalogue.ModelCatalogue(DB);
    await objCatalogue.updateProductVariantsInventoryDataFromArray(arrMppedData);

    // The end %)
    let timeSpent = (Date.now()-starTimeLap)/1000;
    if (timeSpent <= 100) {
        timeSpent = Math.round(timeSpent) + ' sec.';
    } else {
        timeSpent = '' + (timeSpent / 60).toFixed(1) + ' min.';
    }
    console.log("Inventory data update completed in " + timeSpent);

    return DB.close();

}

const fnUpdateAllData = async function(xmlUrl) {
let xmlData;

    try {
        console.log("Downloading "+xmlUrl+" ...");
        xmlData = await httpGet(xmlUrl);
    } catch (err){
        console.log("XML download error");
        console.log(err.message);
        return false;
    }

    try {
        console.log("Parsing XML ...");
        xmlData = await parseXml(xmlData);
    } catch (err){
        console.log("XML parsing error");
        console.log(err.message);
        return false;
    }

    const DB = new db.DataBase(config.db);
    const objCatalogue = new moduleModelCatalogue.ModelCatalogue(DB);


    // ***************************************************************
    // Product categories
    let xmlCategories = xmlData.shop.categories.category;

    if (!xmlCategories) {
        console.log('There is no categories in file');
        DB.close();
        return false;
    }

    xmlCategories = xmlCategories.map((item) => {

        return {
            title: item._, // xml tag content
            id:  item.$.id.replace(/\s+/g, ''),
            // parent id can be undefined
            parent_id: (!item.$.ParentId ? item.$.ParentId : item.$.ParentId.replace(/\s+/g, '') )
        };

    });

    let arrMappedCategories = await updateDbCategories(DB, objCatalogue, xmlCategories);

    // ***************************************************************
    // Updating Products
    let xmlProducts = xmlData.shop.products.product;

    if (!Array.isArray(xmlProducts))
        xmlProducts = [xmlProducts];

    await updateProducts(DB, objCatalogue, xmlProducts, arrMappedCategories);
    return DB.close();

}

async function updateProductsSupplyPricesData(xmlUrl) {

    let xmlData, arrXmlProducts;

    const LOG_PREFIX = 'updateProductsSupplyPricesData';
    const ERR_PREFIX = LOG_PREFIX + ' ERROR:';
    const log = createLogger(LOG_PREFIX);

    try {
        log("Downloading", xmlUrl);
        xmlData = await httpGet(xmlUrl);
    } catch (err){
        log('XML download error:', err.message);
        return false;
    }

    try {
        log("Parsing XML ...");
        xmlData = await parseXml(xmlData);
    } catch (err){
        log("XML parsing error", err.message);
        return false;
    }

    // Validate XML structure
    try {
        arrXmlProducts = xmlData.shop.products_supply_prices_data.product;
    }
    catch (err) {
        log("XML file has wrong format. Path shop.products.product not found.");
        return false;
    }

    if (! Array.isArray(arrXmlProducts) )
        arrXmlProducts = new Array(arrXmlProducts);

    // Map (convert) xml data
    const xmlFieldsAssoc = {
        sku: 'vendorCode',
        year_sales_count: 'year_sales_count',
        base_supply_price_cny: 'base_supply_price_cny',
        price_rub_ddp_moscow: 'price_rub_ddp_moscow',
        price_uah_ddp_odessa: 'price_uah_ddp_odessa',
        price_uds_ddp_nyc: 'price_uds_ddp_nyc',
        price_cny_exw_yiwu: 'price_cny_exw_yiwu',
        price_eur_ddp_warsaw: 'price_eur_ddp_warsaw',
        price_usd_fob_ningbo: 'price_usd_fob_ningbo',
        price_hkd_ddp_hong_kong: 'price_hkd_ddp_hong_kong',
        price_pln_ddp_warsaw: 'price_pln_ddp_warsaw',
        minimal_order_quantity: 'minimal_order_quantity'
    };

    let arrMappedData = arrXmlProducts.map(el => {
        let mappedData = {};

        for(let [dbPropName, xmlPropName] of Object.entries(xmlFieldsAssoc)) {
            if (el[xmlPropName] == undefined)
                continue;
            mappedData[dbPropName] = el[xmlPropName];
        }

        return mappedData;
    });

    // Updating DB
    let DB;

    try {
        DB = new db.DataBase(config.db);
    }
    catch (e) {
        let msg = `${ERR_PREFIX} Unable to initialize DB connection. ERROR: ${e.message}`;
        throw new Error(msg);
    }

    const objCatalogue = new moduleModelCatalogue.ModelCatalogue(DB);
    await objCatalogue.updateProductsSupplyPricesDataFromArray(arrMappedData).catch(err => {

        DB.close().catch();
        let msg = `${ERR_PREFIX} DB update error: ${err.message}`;
        throw new Error(msg);

    });

    DB.close().catch(err => {
        log('Db close error');
    });
    log('Done');

}

exports.UpdateInventoryData = fnUpdateInventoryData;
exports.UpdateAllData = fnUpdateAllData;
exports.updateProductsSupplyPricesData = updateProductsSupplyPricesData;









