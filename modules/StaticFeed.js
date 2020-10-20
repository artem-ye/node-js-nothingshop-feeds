const fs = require('fs');
const xml2js = require('xml2js');
const csv = require('fast-csv');
const csvOptions = {delimiter: ';', headers: true};

class StaticFeed {

    constructor(baseDir, objModelCatalogue) {

        this.objModelCatalogue = objModelCatalogue;
        this.baseDir = baseDir;

        if (this.baseDir == "") {
            throw new Error("StaticFeed constructor baseDir not set");
        }

        if (this.baseDir.substr(-1) != '/') {
            this.baseDir += '/';
        }

    }

    async updateFeeds() {
        await this.updateAllXmlFeeds();
        await this.updateAllCsvFeeds();
        await this.updateAliExpressFeeds();
        await this.updateСdekYML();
    }

    // ***************************************************************************
    // Yandex / SDEK yml

    async updateСdekYML() {

        /*

        30 Mb - Максимальный размер загружаемого файла
        3 шт. - Максимальное кол-во ссылок на файлы
        20 000 шт. - Максимальное кол-во товарных предложений
        5 шт. - Максимальное кол-во изображений на одно товарное предложение
        5 Mb - Максимальный размер файла изображения
        3500 px - Максимальный размер в пикселях по любой из сторон изображения
        300 px - Минимальный размер в пикселях по любой из сторон изображения

         */

        let {offers, categories} = await this.objModelCatalogue.getDataCdekFeed().catch(err => {
            let msg = `Unable to update CDEK feeds. objModelCatalogue.getDataCdekFeed() ERROR: 
            ${ err ? err.message : 'undefined'}`;
            console.error(err);
            return Promise.reject(new Error(msg));
        });

        let feedPath = this._feedPath('CDEK.xml');

        await this.feedCdekYml(offers, categories, feedPath).catch(err => {
            return Promise.reject(err);
        });

        return Promise.resolve();

    }

    async feedCdekYml(offers, categories, feedPath) {

        let dateNow = this._dateNow();

        let xmlData = {
            yml_catalog : {
                $: {date: dateNow},
                shop: {}
            }
        };

        xmlData.yml_catalog.shop = {
            name: 'Nothingshop',
            company: 'Nothingshop',
            url: 'https://catalogue.nothingshop.com/',
            enable_auto_discounts: {_: 'yes'},
            currencies: {
                currency: { $: {id: 'RUR', rate: 1} }
            },
            categories: {category: []},
            offers: {offer: []}
        };

        xmlData.yml_catalog.shop.categories.category = categories.map(elCategory => {

            let xmlCategory =  {
                _: elCategory.title,
                $: {id: elCategory.id}
            };

            if (elCategory.parent_id)
                xmlCategory.$.parentId = elCategory.parent_id;

            return xmlCategory;

        });


         xmlData.yml_catalog.shop.offers.offer  = offers.map(elOffer => {

             let xmlOffer = Object.assign(elOffer);

             // Offer attributes
             xmlOffer.$ = {id: elOffer.id, available: 'true'};
             delete xmlOffer.id;

             // Currency - static field
             xmlOffer.currencyId = 'RUR';

             // Params
             let xmlOfferParams = Object.entries(xmlOffer.params).map(keyVal => {
                let [key, val] = keyVal;
                return {
                    $: {name: key},
                    _: val
                };
             });

             delete xmlOffer.params;

             if (xmlOfferParams.length > 0)
                xmlOffer.param = xmlOfferParams;

             // Prices
             if ( Math.ceil( xmlOffer.price) > Math.ceil(xmlOffer.price_whith_discount)) {
                 xmlOffer.oldprice = xmlOffer.price;
                 xmlOffer.price = xmlOffer.price_whith_discount;
             }

             delete xmlOffer.price_whith_discount;

             // Result
             return xmlOffer;

        });

        let xmlBuilder = new xml2js.Builder();
        let xml = xmlBuilder.buildObject( xmlData );

        fs.writeFile(feedPath, xml, 'utf8', err => {
            if (err)
                throw err;
            else
                console.log("CDEK Feed "+feedPath + " updated");
        });

    }

    // ***************************************************************************
    // Ali Express Feeds

    async updateAliExpressFeeds() {

        let {categories, offers} = await this.objModelCatalogue.getDataAliExpressFeeds();
        let feedPath = this._feedPath('AliExpress.yml');
        this.feedAliExpress(categories, offers, feedPath);

        return Promise.resolve();

    }

    async feedAliExpress(categories, offers, feedPath) {

        let xmlData = {
            shop: {
                categories: {},
                offers: {}
            }
        };

        xmlData.shop.categories.category = categories.map(el => {
            return {
                $: {id: el.id},
                _: el.title
            }
        });

        xmlData.shop.offers.offer  = offers.map(el => {

            let xmlOffer = Object.assign(el);

            xmlOffer.$ = {
                id: xmlOffer.id,
                group_id: xmlOffer.group_id
            };
            delete xmlOffer.id;
            delete xmlOffer.group_id;

            xmlOffer.picture = xmlOffer.pictures.map(elPicture => {
                return {
                   _:elPicture.picture
                };
            });
            delete xmlOffer.pictures;

            return  xmlOffer;

        });


        let xmlBuilder = new xml2js.Builder();
        let xml = xmlBuilder.buildObject( xmlData );

        fs.writeFile(feedPath, xml, 'utf8', err => {
            if (err)
                throw err;
            else
                console.log("Ali Express Feed "+feedPath + " updated");
        });

    }



    // ***************************************************************************
    // CSV Feeds

    async updateAllCsvFeeds() {

        console.log("CSV Feed update: query db...");
        let dataFull = await this.objModelCatalogue.getDataStaticFeedFullCSV();
        let dataInventory = await this.objModelCatalogue.getDataStaticFeedInventoryCSV();

        console.log("CSV Feed update: updating files...");
        this.feedCSV(dataFull, this._feedPath('csv_full.csv'));
        this.feedCSV(dataInventory, this._feedPath('csv_inventory_and_prices.csv'));

    }

    async feedCSV(data, feedPath) {

        let csvData = await csv.writeToString(data, csvOptions);

        fs.writeFile(feedPath, csvData, 'utf8', err => {
            if (err)
                throw err;
        });

        console.log("CSV Feed "+feedPath + " updated");
    }

    // ***************************************************************************
    // XML Feeds

    async updateAllXmlFeeds() {

        console.log("XML Feed update: query db...");
        let products = await this.objModelCatalogue.getProductsForStaticFeed();
        let categories = await this.objModelCatalogue.getCategoriesForStaticFeed();

        console.log("XML Feed update: updating xml_feed_full.xml");
        this.feedFullXML(products, categories, this._feedPath('xml_full.xml'));

        console.log("XML Feed update: updating xml_inventory_and_prices.xml");
        this.feedInventoryAndPricesXML(products, this._feedPath('xml_inventory_and_prices.xml'));

    }

    async feedFullXML(products, categories, feedPath) {

        // debug
        //console.dir(JSON.stringify(products[0])); return false;
        console.log("FeedFullXML: remapping...");

        let dateNow = this._dateNow();
        let prodCounter = 0;

        let resultObj = {catalogue: {

            $: {date: dateNow},

            categories: {
                category:  categories
            },

            products:   {
                product:   products.map(e => {

                    let prod = Object.assign({}, e);
                    prod.$ = {row_num: ++prodCounter};

                    prod.productVariant = prod.productVariants;
                    delete prod.productVariants;

                    prod.productCategory = prod.productCategories;
                    delete prod.productCategories;

                    prod.productPictures = prod.productPictures.map(e => {
                        return {
                            $: {directory: e.directory},
                            url: e.pictures.map(e => {return e.url})
                        };
                    });

                    return prod;
                })
            }

        }};

        console.log("FeedFullXML: building XML...");

        let xmlBuilder = new xml2js.Builder();
        let xml = xmlBuilder.buildObject( resultObj );

        fs.writeFile(feedPath, xml, 'utf8', err => {
            if (err)
                throw err;
        });

        console.log("FeedFullXML: "+feedPath + " updated");

    }

    async feedInventoryAndPricesXML(products, feedPath) {

        console.log("FeedInventoryAndPricesXML: remapping...");
        let dateNow = this._dateNow();
        let prodCounter = 0;

        let resultObj = {catalogue: {

            $: {date: dateNow},

            products:   {
                product:   products.map(e => {

                    //let prod = Object.assign({}, e);
                    let prod = {
                        id: e.id,
                        sku: e.sku
                        //productVariant: e.productVariants
                    };

                    prod.productVariant = e.productVariants.map(v => {

                        return {
                            id: v.id,
                            barcode: v.barcode,
                            ru_price: v.ru_price,
                            ru_price_with_discount: v.ru_price_with_discount,
                            ru_discount_percent: v.ru_discount_percent,
                            ru_inventory_qty: v.ru_inventory_qty
                        };

                    });

                    prod.$ = {row_num: ++prodCounter};

                    return prod;
                })
            }

        }};

        console.log("FeedInventoryAndPricesXML: building XML...");

        let xmlBuilder = new xml2js.Builder();
        let xml = xmlBuilder.buildObject( resultObj );

        fs.writeFile(feedPath, xml, 'utf8', err => {
            if (err)
                throw err;
        });

        console.log("FeedInventoryAndPricesXML: "+feedPath + " updated");

    }


    _dateNow() {

        let dateNow = new Date(Date.now()).toLocaleString("ru", {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
            hour12: false
        });

        return dateNow;
    }

    _feedPath(fileName) {
        return this.baseDir + fileName;
    }

}

module.exports.StaticFeed = StaticFeed;