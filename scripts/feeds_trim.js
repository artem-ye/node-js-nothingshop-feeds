const fs = require('fs');
const xml2js = require('xml2js');

const PRODUCT_LIMIT_QTY = 10;

class XmlFeedTrimmer {

    constructor(fullXmlPath, fullXmlTrimmedPath, smallXmlPath, smallXmlTrimmedPath) {

        if (! fs.existsSync(fullXmlPath)) {
            throw new Error(`File ${fullXmlPath} not exists`);
        }

        if (! fs.existsSync(smallXmlPath)) {
            throw new Error(`File ${smallXmlPath} not exists`);
        }

        this.pathXmlFull = fullXmlPath;
        this.pathTrimmedXmlFull = fullXmlTrimmedPath;

        this.pathXmlSmall = smallXmlPath;
        this.pathTrimmedXmlSmall = smallXmlTrimmedPath;

        this.PRODUCT_LIMIT = PRODUCT_LIMIT_QTY;

    }

    async trim() {

        let productIds = await this.trimFullXml(this.pathXmlFull, this.pathTrimmedXmlFull);
        this.trimSmallXML(productIds, this.pathXmlSmall, this.pathTrimmedXmlSmall);

    }

    async trimFullXml(inPath, outPath) {

        let fullXmlData = await this.parseXML(inPath).catch(err => {
            let msg = `Unable to parse full xml. Path: ${this.pathXmlFull}; Err ${err.message};`;
            throw new Error(msg);
        });

        if (typeof fullXmlData != 'object') {
            let msg = `Full xml parsing error. Unexpected type of result: ${typeof fullXmlData}, 
            expecting 'object'. Path: ${inPath};`;
            throw new Error(msg);
        }

        // Trimming products.
        let arrProductIds = [];
        let arrProductCategoryIds = [];

        this.editXmlTag(Object.entries(fullXmlData), 'products', (el) => {

            let arrProducts = el[0].product.slice(0, this.PRODUCT_LIMIT);
            el[0].product = arrProducts;

            // Caching product ids and its category ids
            arrProducts.forEach(elProduct => {

                arrProductIds.push(elProduct.id[0]);

                if ( ! Array.isArray(elProduct.productCategory))
                    return;

                elProduct.productCategory.forEach(elProductCategoryId => {
                    if ( ! arrProductCategoryIds.includes(elProductCategoryId))
                        arrProductCategoryIds.push(elProductCategoryId);
                });

            });

        });

        // Trimming product categories
        this.editXmlTag(Object.entries(fullXmlData), 'categories', (el) => {

            let arrXmlCategories = el[0].category;

            // Filtering categories
            let trimRes = arrProductCategoryIds
                .map(elCategoryID => {
                    return arrXmlCategories.find(elXmlCategory => elXmlCategory.id == elCategoryID);
                }).sort((a, b) => {
                    // Moving root categories to the top of list
                    // Root categories don`t have tag parent_id
                    if (! a.parent_id)
                        return -1;
                    else if (! b.parent_id)
                        return 1;
                    else
                        return 0;
                });

            el[0].category = trimRes;

        });

        await this.writeXMl(fullXmlData, outPath);
        return arrProductIds;

    }

    async trimSmallXML(arrProductIds, inPath, outPath) {

        const ERR_PREFIX = 'XmlFeedTrimmer::trimSmallXML';

        let xmlData = await this.parseXML(inPath).catch(err => {
            let msg = `Unable to parse small xml. Path: ${this.pathXmlFull}; Err ${err.message};`;
            throw new Error(msg);
        });

        if (typeof xmlData != 'object') {
            let msg = `Small xml parsing error. Unexpected type of result: ${typeof xmlData}, 
            expecting 'object'. Path: ${inPath};`;
            throw new Error(msg);
        }

        if (! Array.isArray(arrProductIds)) {
            let msg = ERR_PREFIX + ' parameter arrProductIds is not an Array';
            throw new Error(msg);
        }

        this.editXmlTag(Object.entries(xmlData), 'products', (el) => {

            let arrProducts = el[0].product;

            arrProducts = arrProducts.filter(elProduct => {
                return arrProductIds.find(productId => elProduct.id[0] == productId);
            });

            el[0].product = arrProducts;

        });

        await this.writeXMl(xmlData, outPath);

    }

    editXmlTag(xmlDataEntries, tagName, fnCallback) {

        for (let [k, v] of xmlDataEntries) {

            if (k == tagName) {
                fnCallback(v);
                return;
            } else {

                if (typeof v == 'object' && ! Array.isArray(v)) {
                    this.editXmlTag(Object.entries(v), tagName, fnCallback);
                }

            }

        }

    }

    async parseXML(path) {

        return new Promise((resolve, reject) => {

            let parser = new xml2js.Parser();

            fs.readFile(path, (err, data) => {
                parser.parseString(data, (err, result) => {

                    if (err)
                        reject(err);
                    else
                        resolve(result);

                });
            });

        });

    }

    async writeXMl(data, path) {

        let builder = new xml2js.Builder();
        let xml = builder.buildObject(data);

        fs.writeFileSync(path, xml);

    }

}



async function main() {


    const PATH_FULL_XML = '/var/www/static_feeds/xml_full.xml';
    const PATH_FULL_XML_TRIMMED = '/var/www/static_feeds/samples/xml_full_top_10.xml';
    const PATH_SMALL_XML = '/var/www/static_feeds/xml_inventory_and_prices.xml';
    const PATH_SMALL_XML_TRIMMED = '/var/www/static_feeds/samples/xml_inventory_and_prices_top_10.xml';

    let xmlTrimmer = new XmlFeedTrimmer(PATH_FULL_XML, PATH_FULL_XML_TRIMMED, PATH_SMALL_XML, PATH_SMALL_XML_TRIMMED);
    xmlTrimmer.trim();


    //test();


}

main();
