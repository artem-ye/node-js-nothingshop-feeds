
const ModelShopifyHTTP = require('./ModelShopifyHTTP');


class ModelShopify {

    constructor(objModelCatalogue) {


        this.apiAuth = {
            key: '', //user
            pass: '',
            host: 'mersadatrade.myshopify.com',
            port: 443
        };


        // nothinghsop
        /*
        this.apiAuth = {
          key: '87a006d60434d5f9f88e1cfddbad3565', //user
          pass: 'b6561c9aae7bbeb1360430fa33e558f5',
          host: 'nothingshop-com.myshopify.com',
          port: 443
        };
        */

        this.db = objModelCatalogue.db;
        this.dbTables = Object.assign({}, objModelCatalogue.dbTables);

        this.dbTables.view_products = 'vw_shopify_supply_prices_products';
        this.dbTables.view_products_variants = 'vw_shopify_supply_prices_products_variants';

        this.shopifyHttp = new ModelShopifyHTTP(this.apiAuth.key, this.apiAuth.pass, this.apiAuth.host);

    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // Interface
    //////////////////////////////////////////////////////////////////////////////////////////////////////

    async test() {

        let rsSiteCollects = await this.getSiteCollects().catch(err => {
            let msg = ERR_PREFIX + ' Unable to get site collects. getSiteCollects Error: ' + err.message;
            throw new Error(msg);
        });


        console.log('Total collects records', rsSiteCollects.length);
        console.log('DEBUG', 'filter');
        console.dir(rsSiteCollects.filter(el => el.product_id == 4936446836868));
        //throw new Error('DEBUG. Break');


        /*
                let rsProducts = [
                    {db_product_id: '73849', product_id: '4815093956740'}
                ];

                let rsCustomCollections = await this.syncSiteCustomCollections();

                // Products custom collections
                await this.syncSiteProductsCustomCollections(rsProducts, rsCustomCollections);
         */

    }

    async syncAllData() {

        // Products
        let rsProducts = await this.syncSiteProducts();

        // Custom collections
        let rsCustomCollections = await this.syncSiteCustomCollections();

        // Products custom collections
        await this.syncSiteProductsCustomCollections(rsProducts, rsCustomCollections);

        // Inventory data
        await this.syncSiteProductsInventory();

    }

    async syncInventoryData() {

        await this.syncSiteProductsInventory();

    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // High level API
    //////////////////////////////////////////////////////////////////////////////////////////////////////

    async syncSiteCustomCollections() {

        const CATEGORY_PATH_DELIMITER = '/';
        const ERR_PREFIX = 'ERR!!! ModelShopify::syncSiteCustomCollections';
        let starTimeLap = Date.now();

        // Fetching site custom collections
        let arrSiteCollections = await this.getSiteCustomCollections()
            .catch(err => {
                let msg = ERR_PREFIX + ' getSiteCustomCollections HTTP Error: ' + err.message;
                throw new Error(msg);
            });

        // Fetching DB categories (custom collections)
        let db = this.db;
        let sql = `                
        SELECT 
            cat.id AS db_category_id, 
            cat.parent_id AS db_category_parent_id,
            cat.title AS db_category_title,                
            cat.level AS db_category_level
        
        FROM  ${this.dbTables.categories} cat  
        ORDER BY cat.level                           
        `;

        let recSetDbCategories = await db.query(sql)
            .catch(err => {
                let msg = ERR_PREFIX + ' db.query SQL Error: ' + err.message;
                throw new Error(msg);
            });

        // Mapping site collections to db categories.
        // Key field is collection 'title', which consists of full path of category:
        //  Одежда/Женская одежда/Юбки
        recSetDbCategories.forEach(row => {

            // Computing full path of current db category by parent_id
            let siteCollectionTitle = row.db_category_title;
            let categoryParentId = row.db_category_parent_id;

            while (categoryParentId) {
                let rowParentCategory = recSetDbCategories
                    .find(el => el.db_category_id == categoryParentId);


                if (! rowParentCategory)
                    break;

                categoryParentId = rowParentCategory.db_category_parent_id;
                siteCollectionTitle = rowParentCategory.db_category_title + CATEGORY_PATH_DELIMITER + siteCollectionTitle;
            }

            row.collection_title = siteCollectionTitle;
            row.collection_id = undefined;
            row.collection_handle = undefined;

            // Mapping site collection to db category
            let elSiteCollection = arrSiteCollections.find(el => el.title == siteCollectionTitle);

            if (elSiteCollection) {
                row.collection_id = elSiteCollection.id;
                row.collection_handle = elSiteCollection.handle;
            }

        });

        // Removing not mapped site collections
        for (let elSiteCategory of arrSiteCollections) {

            if (! recSetDbCategories.find(elDbCategory => elDbCategory.collection_id == elSiteCategory.id) ) {

                console.log('Custom collections sync: Removing id: ' + elSiteCategory.id + '; title: ' + elSiteCategory.title);

                await this.deleteSiteCustomCollection(elSiteCategory.id)
                    .catch(err => {
                        let msg = `${ERR_PREFIX} deleteSiteCustomCollection 
                        (id: ${elSiteCategory.id} title: ${elSiteCategory.title}) 
                        HTTP Error:  ${err.message}`;
                        throw new Error(msg);
                    });
            }

        }

        // Adding new collections to site
        for (let dbCategory of recSetDbCategories.filter(el => !el.collection_id)) {

            let newCollectionData = await this.addSiteCustomCollection(dbCategory.collection_title)
                .catch(err => {
                    let msg = ERR_PREFIX + ' unable to create new collection ' +  dbCategory.collection_title
                       + '. Err: ' + err.message;
                    throw new Error(msg);
                });

            dbCategory.collection_id = newCollectionData.id;
            dbCategory.collection_handle = newCollectionData.handle;
            console.log('Collection created: ' + dbCategory.collection_title);

        }

        // Updating collections meta fields
        for (let dbCategory of recSetDbCategories) {

            // Meta fields data
            let arrDbMetaFields = [];

            // title
            arrDbMetaFields.push(
                {key: 'title', value: dbCategory.db_category_title, value_type: "string"}
            );

            // Parent collections
            let parentId = dbCategory.db_category_parent_id;
            let parentCollectionsValue = '';

            while (parentId) {
                let parentCollection = recSetDbCategories.find(el => el.db_category_id == parentId);

                if (! parentCollection)
                    break;

                parentCollectionsValue = ',' + parentCollection.collection_handle + parentCollectionsValue;
                parentId = parentCollection.db_category_parent_id;
            }

            if (parentCollectionsValue == '')
                parentCollectionsValue = '-';
            else
                parentCollectionsValue = parentCollectionsValue.substr(1, parentCollectionsValue.length);

            arrDbMetaFields.push(
                {key: 'parent_collections', value: parentCollectionsValue, value_type: "string"}
            );

            // Sub collections
            let subCollectionsValue = recSetDbCategories.filter(el => el.db_category_parent_id == dbCategory.db_category_id)
                .map(el => el.collection_handle).join(',');

            if (subCollectionsValue == '')
                subCollectionsValue = '-';

            arrDbMetaFields.push(
                {key: 'sub_collections', value: subCollectionsValue, value_type: "string"}
            );

            // adding namespace field
            arrDbMetaFields.forEach(el => el.namespace = 'collection_tree');

            // Comparing site meta fields values and db meta fields value, calculated above
            let arrSiteCollectionMetaFields = await this.getSiteCustomCollectionMetaData(dbCategory.collection_id)
                .catch(err => {
                    let msg = ERR_PREFIX + ' unable to get site collections meta data. ERROR: ' + err.message;
                    throw new Error(msg);
                });
            arrSiteCollectionMetaFields = arrSiteCollectionMetaFields.metafields;

            for (let elDbMetaField of arrDbMetaFields) {
                let siteMetaField = arrSiteCollectionMetaFields.find(el => el.key == elDbMetaField.key);

                if (!siteMetaField || siteMetaField.value != elDbMetaField.value) {
                    console.log('Updating collection metadata: ' + dbCategory.collection_handle);
                    //elDbMetaField.namespace = 'collection_tree';
                    await this.addSiteCustomCollectionMetaField(dbCategory.collection_id, {metafield: elDbMetaField})
                        .catch(err => {
                            let msg = ERR_PREFIX + ' unable to update collection metafields : ' + err.message;
                            throw new Error(msg);
                        });
                }
            }

        }

        recSetDbCategories = recSetDbCategories.map(el => {
            return {
                db_category_id: el.db_category_id,
                db_category_parent_id: el.db_category_parent_id,
                collection_id: el.collection_id
            };
        });

        let timeSpent = (Date.now()-starTimeLap)/1000;
        if (timeSpent <= 100) {
            timeSpent = Math.round(timeSpent) + ' sec.';
        } else {
            timeSpent = '' + (timeSpent / 60).toFixed(1) + ' min.';
        }
        console.log("ModelShopify::syncSiteCustomCollections completed in " + timeSpent);

        return recSetDbCategories;

    }

    async syncSiteProductsCustomCollections(rsProducts, rsCustomCollections) {

        const ERR_PREFIX = 'ERR!!! ModelShopify::syncSiteProductsCustomCollections';
        let starTimeLap = Date.now();

        let sql = `
            SELECT 
                product_id AS db_product_id, 
                category_id AS db_category_id 
            FROM 
                ${this.dbTables.product_categories}
        `;

        let rsDbProductsCategories = await this.db.query(sql).catch(err => {
            let msg = ERR_PREFIX + ' SQL Error: ' + err.message;
            throw new Error(msg);
        });

        let rsSiteCollects = await this.getSiteCollects().catch(err => {
            let msg = ERR_PREFIX + ' Unable to get site collects. getSiteCollects Error: ' + err.message;
            throw new Error(msg);
        });

        for (let product of rsProducts) {

            // Getting all product categories from db and mapping them ids to sit collection ids
            let productCollectionsIDs = [];
            let db_product_id = product.db_product_id;
            let site_product_id = product.product_id;

            if (!site_product_id)
                continue;

            // Filling array of product custom collection ids: productCollectionsIDs
            rsDbProductsCategories.filter(el => el.db_product_id == db_product_id).forEach(elDbCategory => {

                let findRes = rsCustomCollections.find(el => el.db_category_id == elDbCategory.db_category_id);

                // Parent categories
                while (findRes) {

                    //if (productCollectionsIDs.indexOf(findRes.db_category_id) == -1)
                    if (productCollectionsIDs.indexOf(findRes.collection_id) == -1)
                        productCollectionsIDs.push(findRes.collection_id);

                    findRes = rsCustomCollections.find(
                        elCustomCollection => elCustomCollection.db_category_id == findRes.db_category_parent_id
                    );
                }

            });

            // Updating site data: delete collections, which not presented in DB
            for (let siteCollect of rsSiteCollects.filter(el => el.product_id == site_product_id) ) {
                let idx = productCollectionsIDs.indexOf(siteCollect.collection_id);

                if (idx == -1) {

                    // delete wrong collect entry
                    await this.deleteSiteCollect(siteCollect.id).catch(err => {
                        console.dir(siteCollect);
                        let msg = ERR_PREFIX + ' Unable to delete collect. Error: ' + err.message;
                        throw new Error(msg);
                    });
                } else {
                    // correct entry, so we dont need update it
                    productCollectionsIDs.splice(idx, 1);
                }

            }

            // Adding new collect entries
            for (let collectionId of productCollectionsIDs) {

                let collect = {
                    collect: {
                        product_id: site_product_id,
                        collection_id: collectionId
                    }
                };

                await this.addSiteCollect(collect).catch(err => {
                    console.log(JSON.stringify(collect));
                    let msg = ERR_PREFIX + ' Unable to add collect. Error: ' + err.message;

                    console.log('Product ID:', site_product_id);
                    console.log('Product collection IDS:', productCollectionsIDs);
                    console.log('Site collects:', rsSiteCollects.filter(el => el.product_id == site_product_id))

                    throw new Error(msg);
                });
            }

        }

        // The end %)
        let timeSpent = (Date.now()-starTimeLap)/1000;
        if (timeSpent <= 100) {
            timeSpent = Math.round(timeSpent) + ' sec.';
        } else {
            timeSpent = '' + (timeSpent / 60).toFixed(1) + ' min.';
        }

        console.log("ModelShopify::syncSiteProductsCustomCollections completed in " + timeSpent);

    }

    /***
     *
     * @returns [{product_id: str, db_product_id: num}, ...]
     */
    async syncSiteProducts() {
    let sql;

        let logger = this.createLogger('syncSiteProducts');
        logger('Sync site products started');

        const db = this.db;
        const dbTables = this.dbTables;
        let starTimeLap = Date.now();

        // Temporary table, which holds CMS products ids
        let tmpTableName = 'tmp_site_products';
        sql = `
        CREATE TEMPORARY TABLE ${tmpTableName} (
            product_id VARCHAR(1000), 
            product_variant_id VARCHAR(1000),
            product_sku VARCHAR(1000),
            product_barcode VARCHAR(1000)
        )`;
        db.query(sql).catch(err => {
            let msg = `ModelShopify::syncSiteProducts ERR: Unable to create temporary table ${tmpTableName}. 
                   Error: ${err.message}`;
            throw new Error(msg);
        });

        logger('REST API: Request site products');
        let arrSiteProducts = await this.getSiteProducts();
        let arrProductsSku = []; // to check duplicated products

        logger('Total products in CMS', arrSiteProducts.length);
        logger('Validating products catalogue: searching for invalid products');

        for (let prod of arrSiteProducts) {
           let prodVariants = prod.variants;

           if (prodVariants.length == 0) {
               await this.deleteSiteProduct(prod.id).catch(err => {
                   let msg = `ModelShopify::syncSiteProducts ERR: Unable to delete product variant. 
                   Error: ${err.message}`;
                   throw new Error(msg);
               });
           }
           else if (arrProductsSku.includes(prodVariants[0].sku)) {

               logger('Duplicated sku', prodVariants[0].sku);
               await this.deleteSiteProduct(prod.id).catch(err => {
                   let msg = `ModelShopify::syncSiteProducts ERR: Unable to delete product variant. 
                   Error: ${err.message}`;
                   throw new Error(msg);
               });

           }
           else {

               arrProductsSku.push(prodVariants[0].sku);

               for (let prodVariant of prodVariants) {
                   await db.query(
                       `INSERT INTO ${tmpTableName} 
                            (product_id, product_variant_id, product_sku, product_barcode) 
                        VALUES (?,?,?,?)`,
                       [prod.id, prodVariant.id, prodVariant.sku, prodVariant.barcode]
                   );
               }

           }
        }

        logger('Validating products catalogue: searching for not mapped products');
        // Delete products and product variants, which was not found id DB

        // CMS Products with DB product IDs and  variants IDs

        sql = `
        CREATE TEMPORARY TABLE tmp_cms_products_with_db_id
        SELECT 
            ${tmpTableName}.*, 
            product_variants.id db_product_variant_id,
            product_variants.product_id db_product_id
        
        FROM ${tmpTableName} 
        
            LEFT JOIN ${dbTables.view_products_variants} product_variants
            ON product_variants.barcode = ${tmpTableName}.product_barcode
        
            /*
            LEFT JOIN (
            
                SELECT 
                    id, product_id, barcode, not_supplied
                FROM
                    product_variants
                WHERE
                    product_id IN (SELECT product_id FROM product_categories)
                    
            ) product_variants
            ON product_variants.barcode = ${tmpTableName}.product_barcode
            AND product_variants.not_supplied = 0
             */
            
        ;
            
        -- Counting db ids
        CREATE TEMPORARY TABLE tmp_cms_products_db_id_count
        SELECT 
            product_id, COUNT(db_product_variant_id) db_product_variant_id_count
        FROM 
            tmp_cms_products_with_db_id    
        GROUP BY
            product_id;
        
        /**************************************************************************
        * Results
        **************************************************************************/
        
        -- CMS products, which not found in DB
        SELECT DISTINCT product_id 
        FROM tmp_cms_products_db_id_count    
        WHERE IFNULL(db_product_variant_id_count, 0) = 0
        ORDER BY product_id;
        
        -- CMS product variants, which was not found id DB
        SELECT 
            tmp_cms_products_with_db_id.product_id,
            tmp_cms_products_with_db_id.product_variant_id
            
        FROM tmp_cms_products_with_db_id,
            tmp_cms_products_db_id_count
            
        WHERE IFNULL(tmp_cms_products_db_id_count.db_product_variant_id_count, 0) > 0
            AND tmp_cms_products_db_id_count.product_id = tmp_cms_products_with_db_id.product_id
            AND tmp_cms_products_with_db_id.db_product_variant_id IS NULL;
            
        -- Drop tmp tables
        DROP TABLE tmp_cms_products_db_id_count;
        `;

        let resultSet = await db.query(sql);
        let resultSetDeleteProductsVariants = resultSet[resultSet.length-2];
        let resultSetDeleteProducts = resultSet[resultSet.length-3];

        if (resultSetDeleteProductsVariants.length > 0) {
            logger('Delete site products variants, where bar codes does not found in db. Products to delete',
                resultSetDeleteProductsVariants.length);

            // Delete site product variants
            for (let siteProdVariant of resultSetDeleteProductsVariants) {
                logger('Delete site product variant. Barcode not found in db. Variant ID ',
                    siteProdVariant.product_variant_id, ' Product ID: ', siteProdVariant.product_id);
                this.deleteSiteProductVariant(siteProdVariant.product_id, siteProdVariant.product_variant_id).catch(err => {
                    let msg = `ModelShopify:syncSiteProducts: Unable to delete product variant. 
                    Vnt ID:${siteProdVariant.product_variant_id} Prod. ID ${siteProdVariant.product_id}. Msg: ${err.message}`;
                    throw new Error(msg);
                });
            }

        }

        // Delete site products
        if (resultSetDeleteProducts.length) {
            logger('Delete site products, where all bar codes does not found in db. Products to delete',
                resultSetDeleteProducts.length);

            for (let siteProd of resultSetDeleteProducts) {
                logger('Delete site product. ALl product variant barcodes not found id ', siteProd.product_id);
                await this.deleteSiteProduct(siteProd.product_id).catch(err => {
                    let msg = 'ModelShopify:syncSiteProducts: ' + 'Unable to delete product ' + JSON.stringify(siteProd)
                        + ' Error: ' + err.message;
                    throw new Error(msg);
                });
            }
        }

        logger('Query data difference');

        // Updating CMS catalogue
        sql = `
        CREATE TEMPORARY TABLE tmp_product_variants
        SELECT 
            v.*
        FROM (
                SELECT 
                    product_id, size, MAX(barcode) barcode 
                FROM 
                    ${dbTables.view_products_variants} product_variants
                GROUP BY 
                    product_id, size
            ) uniq_sizes,
            ${dbTables.view_products_variants} v
                
        WHERE 
            v.product_id = uniq_sizes.product_id 
            AND v.barcode = uniq_sizes.barcode;
            
        /**************************************************************************
        * Results
        **************************************************************************/
            
        -- Products with CMS ids
        SELECT 
            p.*, 
            cms_ids.site_product_id
            
        FROM (
                SELECT * FROM ${dbTables.view_products} WHERE id IN (
                    SELECT product_id FROM tmp_product_variants
                )
            ) p
            
            LEFT JOIN (
                SELECT 
                    product_id site_product_id, 
                    MAX(db_product_id) db_product_id    
                FROM 
                    tmp_cms_products_with_db_id
                GROUP BY 
                    product_id
            )  cms_ids 
            ON cms_ids.db_product_id = p.id;
            
        -- Product variants with CMS ids
        SELECT 
            v.*,
            tmp_cms_products_with_db_id.product_variant_id
            
        FROM tmp_product_variants v
        
            LEFT JOIN tmp_cms_products_with_db_id
            ON tmp_cms_products_with_db_id.db_product_variant_id = v.id;
            
        -- Default pictures    
        SELECT product_id, pic_order, fn_picture_url(uri) url 
        FROM product_pictures 
        WHERE product_id IN (SELECT product_id FROM tmp_product_variants) AND directory = 'default';
        
        /**************************************************************************
        * DROP tmp tables
        **************************************************************************/  
        DROP TABLE tmp_cms_products_with_db_id;
        DROP TABLE tmp_product_variants;
        `;

        resultSet = await db.query(sql);
        resultSet.pop(); resultSet.pop();

        let rsProductPictures = resultSet.pop();
        let rsProductVariants = resultSet.pop();
        let rsProducts = resultSet.pop();

        let newProductsCounter = 0;
        let newProductsCount = rsProducts.reduce(
            (accum, el)=>{ return accum + (el.site_product_id == null && el.title ? 1 : 0) }, 0
        );
        logger('Update CMS data. New products count:', newProductsCount, 'of', rsProducts.length);

        for (let prod of rsProducts) {

            let prodVariants = rsProductVariants.filter(el => el.product_id == prod.id);

            if (prodVariants.length == 0 || !prod.title)
                continue;

            if (prod.site_product_id == null) {
                if (newProductsCounter >= 1000) {
                    //console.log('New product limit reached. Break ')
                    continue;
                }

                newProductsCounter++;
            }

            // Product
            let productData = {};
            productData.title = prod.title;
            productData.vendor = prod.vendor;
            productData.body_html = prod.description;
            productData.product_type = prod.type;

            productData.options = [{name: 'Размер'}];

            // Images
            productData.images = rsProductPictures.filter(el => el.product_id == prod.id).map(el => {
                return {
                   src: el.url,
                   position: el.pic_order
                };
            });

            // Variants
            productData.variants =  prodVariants.map(el => {
                return  {
                    barcode: el.barcode,
                    grams: prod.weight,
                    weight: prod.weight,
                    weight_unit: 'g',
                    sku: prod.sku,
                    price: el.price,
                    option1: el.size,
                    inventory_management: 'shopify',
                    //inventory_policy: 'deny'
                    inventory_policy: 'continue'
                };
            });

            // Product meta fields
            let productMetaFieldsData = [];

            productMetaFieldsData.push({
                key: 'sku',
                value: prod.sku,
                value_type: 'string'
            });
            productMetaFieldsData.push({
                key: 'color',
                value: prodVariants[0].color,
                value_type: 'string'
            });

            productMetaFieldsData = productMetaFieldsData.map(el => {
                el.namespace = "product_options";
                return {metafield: el}
            });

            if (prod.site_product_id == null) {

                productData.published_at = null;
                productData.handle = (prod.type.split(' ').join('-') + '-' + prod.sku).toLowerCase().trim();

                let res = await this.addSiteProduct({product: productData})
                    .catch(err => {
                        console.log('ERROR!!! Unable to create new product:');
                        console.dir(productData);
                        console.log(err.message);
                        throw err;
                    });

                let newProdId = res.product.id;

                await this.setSiteProductMetaFields(productMetaFieldsData, newProdId)
                    .catch(err => {
                        console.log('ERROR!!! Unable to update product meta fields: ' + err.message);
                        throw err;
                    });

                prod.site_product_id = newProdId;
                logger('Product Created:', res.product.title, 'Handle:',  res.product.handle);

            } else {

                let siteProductData = arrSiteProducts.find(el => el.id == prod.site_product_id);

                if (!siteProductData)
                    throw new Error('Something wrong; Product not found');

                let productDiff = {};

                // Compare product header.
                for (let [key, value] of Object.entries(productData)) {

                    let isEqual = true;

                    if (key == 'variants')
                        continue;

                    if (key == 'images') {

                        continue;
                        /*
                        // We can't check image url, cos CMS modifies URL
                        isEqual = (value.length == siteProductData[key].length);

                        // dbg
                        if (!isEqual)
                            console.log('Img db qty:', value.length, 'site img qty:', siteProductData[key].length);
                         */
                    }
                    else if (key == 'options') {
                        // Check only options names
                        let arrSiteValues = siteProductData[key];

                        if (value.length != arrSiteValues.length)
                            isEqual = false;
                        else
                            isEqual = value.every( (el, idx) => el.name == arrSiteValues[idx].name );

                    }
                    else if (typeof value != 'object') {
                        isEqual = (value.trim() == siteProductData[key].trim());
                    }

                    if (!isEqual) {
                        productDiff[key] = value;
                    }

                }

                if (Object.entries(productDiff).length > 0) {
                    logger('Updating product', productData.variants[0].sku,
                        'id', siteProductData.id,
                        'properties changed:', Object.entries(productDiff).length+';',
                        Object.entries(productDiff).map(el => el[0]));
                    await this.updateSiteProduct({product: productDiff}, siteProductData.id);

                    // Rewriting product meta fields
                    await this.setSiteProductMetaFields(productMetaFieldsData, siteProductData.id)
                        .catch(err => {
                            console.log('ERROR!!! Unable to update product meta fields: ' + err.message);
                            throw err;
                        });
                }

                // Product variants
                for (let prodVariant of productData.variants) {

                    let findRes = siteProductData.variants.filter(el => el.barcode.trim() == prodVariant.barcode.trim());

                    if (findRes.length == 0) {
                        // Add new product variant
                        await this.addSiteProductVariant({variant: prodVariant}, siteProductData.id)
                            .catch(err => {
                                let msg = 'Unable to add product variant: ' + JSON.stringify(prodVariant)
                                    + ' Error: ' + err.message;
                                console.log(msg);
                                throw new Error(msg);
                            });
                    }
                    else if (findRes.length == 1) {
                        let siteVariant = findRes[0];

                        for (let [k, v] of Object.entries(prodVariant)) {
                            //if (String(v).trim() != String(siteVariant[k]).trim()) {
                            if (! (v == siteVariant[k] || String(v).trim() == String(siteVariant[k]).trim()) ) {
                                // Something modified, updating whole variant
                                logger('Updating variant. Barcode: ',siteVariant.barcode,' Prop:',k,' DB:', v, 'CMS:', siteVariant[k]);
                                await this.updateSiteProductVariant({variant: prodVariant}, siteVariant.id)
                                    .catch(err => {
                                        console.log('Unable to update product variant.', JSON.stringify(prodVariant));
                                        throw new Error(err);
                                    });
                            }
                        }

                    }
                    else {
                        // duplicated bar codes
                        for (let siteVariant of findRes) {
                            await this.deleteSiteProductVariant(siteProductData.id, siteVariant.id).catch(err => {
                                let msg = 'Unable to delete duplicated bar codes ' + JSON.stringify(findRes);
                                throw new Error(msg);
                            });
                        }

                        await this.addSiteProductVariant({variant: prodVariant}, siteProductData.id);
                    }

                }

                //console.dir(JSON.stringify(productDiff));
                //break;
            }

        }

        // The end %)
        let timeSpent = (Date.now()-starTimeLap)/1000;
        if (timeSpent <= 100) {
            timeSpent = Math.round(timeSpent) + ' sec.';
        } else {
            timeSpent = '' + (timeSpent / 60).toFixed(1) + ' min.';
        }
        logger("ModelShopify::syncSiteProducts completed in " + timeSpent);

        return rsProducts.map(el => {
            return {
                product_id: el.site_product_id,
                db_product_id: el.id
            };
        });

    }

    /**
     *
     * @param {boolean} syncInventoryCount, default true
     *  - false: inventory_count will always be equal to 1
     *  - true:  inventory_count will be filled with data from DB
     * @returns {Promise<void>}
     */
    async syncSiteProductsInventory() {

        // Function sync: price, inventory_qty and published_at field,
        // which controls visibility of product:
        // - Disabled (hide) products: have no price or zero inventory_qty.
        // - Products, with inventory_qty > 0 and price > 0 will be enabled

        // All this 3 attributes we can read from product
        // But, inventory_qty can`t be updated directly in product
        // To update it we must use inventory_levels/set.json endpoint

        const LOG_PREFIX = 'ModelShopify::syncSiteProductsInventory';
        const ERR_PREFIX = 'ERR!!! ModelShopify::syncSiteProductsInventory';

        console.log(LOG_PREFIX, 'Started. API Request site products');

        // Request site products
        let siteProducts = await this.getSiteProducts();

        console.log(LOG_PREFIX, 'Site products fetched. Adding to tmp db.');

        // Adding them to tmp sql table
        const db = this.db;
        const dbTables = this.dbTables;
        const sqlTmpTableCmsProducts = 'tmp_cms_products';

        let sql = `
        CREATE TEMPORARY TABLE ${sqlTmpTableCmsProducts} (
            product_id VARCHAR(1000), 
            product_variant_id VARCHAR(1000),
            product_barcode VARCHAR(1000),
            inventory_item_id VARCHAR(1000),
            -- price FLOAT(53),
            price FLOAT(10,2),
            inventory_quantity INT,
            published_at VARCHAR(1000)
        )`;

        await db.query(sql);

        let sqlInsert = `
        INSERT INTO ${sqlTmpTableCmsProducts} 
            (product_id, product_variant_id, product_barcode, inventory_item_id, price, inventory_quantity, published_at)
        VALUES (?,?,?,?,?,?,?)
        `;

        for (let siteProd of siteProducts) {
            for (let siteProdVariant of siteProd.variants) {

                await db.query(sqlInsert,
                    [
                        siteProd.id,
                        siteProdVariant.id,
                        siteProdVariant.barcode,
                        siteProdVariant.inventory_item_id,
                        siteProdVariant.price,
                        siteProdVariant.inventory_quantity,
                        siteProd.published_at
                    ]
                );

            }
        }

        console.log(LOG_PREFIX, 'Done. Query difference...');

        // Compare cms data with dp
        sql = `
        CREATE TEMPORARY TABLE tmp_inventory 
        SELECT
            cms.product_id, 
            cms.product_variant_id,
            cms.product_barcode,
            cms.inventory_item_id,
            cms.price,
            cms.inventory_quantity,
            cms.published_at,     
            IFNULL(v.price,0) db_price,
            IFNULL(v.inventory_qty,0) db_qty            
        FROM
            ${sqlTmpTableCmsProducts} cms
            
                LEFT JOIN ${dbTables.view_products_variants} v
                ON v.barcode = cms.product_barcode
        ;
            
        -- Drop tmp table with cms products
        DROP TABLE ${sqlTmpTableCmsProducts};
        
        /**********************************************************
        * Calculating product data difference
        **********************************************************/
            
        -- Price diff (we must update all product variants, to prevent delete not listed variants)
        CREATE TEMPORARY TABLE tmp_price_diff
        SELECT DISTINCT product_id 
        FROM tmp_inventory
        WHERE price <> db_price;
                
        -- Enabled/Disabled products
        CREATE TEMPORARY TABLE tmp_published_at_diff
        SELECT 
            product_id, is_enabled, FALSE is_updated    
        
        FROM ( 
                SELECT 
                    product_id,               
                    published_at, 
                    
                    CASE 
                        WHEN (MAX(db_price) = 0 OR SUM(db_qty) = 0) THEN FALSE 
                    ELSE TRUE 
                    END is_enabled
                
                FROM
                    tmp_inventory
                GROUP BY
                    product_id, published_at
            ) t  
         
        WHERE
            (is_enabled = TRUE AND published_at IS NULL)
                OR (is_enabled = FALSE AND published_at IS NOT NULL);
        
        /**********************************************************
        * Results
        **********************************************************/
        
        -- Inventory diff (stock qty)
        SELECT  
            inventory_item_id,
            db_qty AS inventory_quantity             
        FROM 
            tmp_inventory        
        WHERE 
            IFNULL(db_qty, 0) <> inventory_quantity;
        
        -- Modified products  (to minimize api calls)
        SELECT DISTINCT product_id FROM tmp_price_diff
        UNION 
        SELECT product_id FROM tmp_published_at_diff;
        
        -- Price diff (product variants with prices)
        SELECT  
            tmp_inventory.product_id, 
            tmp_inventory.product_variant_id,
            tmp_inventory.db_price price         
        FROM 
            tmp_price_diff, tmp_inventory
        WHERE 
            tmp_price_diff.product_id = tmp_inventory.product_id;
            
        -- Published at diff
        SELECT 
            product_id, is_enabled 
        FROM 
            tmp_published_at_diff;
        
        /**********************************************************
        * Drop temporary tables
        **********************************************************/
        DROP TABLE tmp_price_diff; 
        DROP TABLE tmp_published_at_diff;
        DROP TABLE tmp_inventory;
        `;

        let queryResults = await db.query(sql).catch(err => {
            let msg = ERR_PREFIX + ' Unable to query inventory data. SQL Error: ' + err.message;
            throw new Error(msg);
        });

        console.log(LOG_PREFIX, 'Processing query results...');

        let queryResultsLen = queryResults.length;
        let rsPublishedAtDiff = queryResults[queryResultsLen-4];
        let rsPriceDiff = queryResults[queryResultsLen-5];
        let rsModifiedProductIDs = queryResults[queryResultsLen-6];
        let rsModifiedInventoryData = queryResults[queryResultsLen-7];

        // -----------------------------------------------------------------------------------------
        // Updating inventory data

        console.log(LOG_PREFIX, 'Updating inventory data');

        const locationId = await this.getSiteInventoryDefaultLocationId();

        for (let inventoryData of rsModifiedInventoryData) {

            let requestData = {
                location_id: locationId,
                inventory_item_id: inventoryData.inventory_item_id,
                available: inventoryData.inventory_quantity
            };

            console.log(LOG_PREFIX, 'Updating inventory data', inventoryData.inventory_item_id)
            await this.updateSiteInventoryData(requestData);

        }

        console.log(LOG_PREFIX, 'Done');

        // -----------------------------------------------------------------------------------------
        // Updating products

        // Enabled/disabled products.
        //  - Unpublished (hidden) products must have null in published_at field
        //  - Published (visible) products must have time stamp (yyyy-MM-ddTHH:mm:ss+00:00)
        //    in published_at field.
        let date = new Date();
        let published_at_date = date.getUTCFullYear();
        published_at_date += '-' + String(date.getUTCMonth() +1).padStart(2, '0');
        published_at_date += '-' + String(date.getUTCDate()).padStart(2, '0');
        published_at_date += 'T' + String(date.getUTCHours()).padStart(2, '0');
        published_at_date += ':' + String(date.getUTCMinutes()).padStart(2, '0');
        published_at_date += ':' + String(date.getUTCSeconds()).padStart(2, '0');
        published_at_date += ('+00:00');


        //console.log(rsPublishedAtDiff);

        for (let product of rsModifiedProductIDs) {
            let productId = product.product_id;
            let productData = {};

            let productDataVariants = rsPriceDiff.filter(el => el.product_id == productId).map(el => {
                return {
                    id: el.product_variant_id,
                    price: el.price
                };
            });

            let findRes = rsPublishedAtDiff.find(el => el.product_id == productId);
            if (findRes) {
                productData.published_at = findRes.is_enabled ? published_at_date : null;
            }

            if (productDataVariants.length > 0) {
                productData.variants = productDataVariants;
            }

            // Updating product data
            console.log('Updating product ', productId);
            //console.dir(productData);
            await this.updateSiteProduct({product: productData}, productId);

        }


        //let r = await this.db.query(`SELECT * FROM ${sqlTmpTableCmsProducts}`);
        //console.log(r[0]);





        //console.dir(siteProducts[0]);

    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////
    // Shopify API
    //////////////////////////////////////////////////////////////////////////////////////////////////////

    // --------------------------------------------------------------------------------------------------
    // Products

    async getSiteProducts() {
        let uri = this.shopifyHttp.apiPaths.products_get;
        let arrSiteProducts = [];

        await this.shopifyHttp.httpGetPaginated(uri, async responseChunk => {

             let siteProducts = JSON.parse(responseChunk.body).products;

             if (Array.isArray(siteProducts))
                 arrSiteProducts.push(...siteProducts);
             else
                 arrSiteProducts.push(siteProducts);

        });

        return arrSiteProducts;
    }

    async addSiteProduct(productData) {
        let uri = this.shopifyHttp.apiPaths.products_post;
        let res = await this.shopifyHttp.httpPost(uri, productData,'',201);
        return  JSON.parse(res.body);
    }

    async updateSiteProduct(productData, productId) {
        let uri = this.shopifyHttp.apiPaths.products_put;
        let res = await this.shopifyHttp.httpPut(uri, productData, productId, 200);
        return  JSON.parse(res.body);
    }

    async setSiteProductMetaFields(metaFields, productId) {
        let metaUri = this.shopifyHttp.apiPaths.products_metafields_post;

        for (let metaField of metaFields) {
            await this.shopifyHttp.httpPost(metaUri, metaField, productId, 201)
                .catch(err => {
                    let msg = 'Unable to update product meta field: ' + JSON.stringify(metaField)
                        + ' Err: ' + err.message;
                    throw new Error(msg);
                });
        }
    }

    async deleteSiteProduct(productId) {
        let uri = this.shopifyHttp.apiPaths.products_delete;
        let res = await this.shopifyHttp.httpDelete(uri, productId);
    }

    // --------------------------------------------------------------------------------------------------
    // Product variants

    async addSiteProductVariant(productVariantData, productId) {
        let uri = this.shopifyHttp.apiPaths.products_variant_post;
        let res = await this.shopifyHttp.httpPost(uri, productVariantData, productId, 201);
        return  JSON.parse(res.body);
    }

    async updateSiteProductVariant(productVariantData, productVariantId) {
        let uri = this.shopifyHttp.apiPaths.products_variant_put;
        let res = await this.shopifyHttp.httpPut(uri, productVariantData, productVariantId, 200);
        return  JSON.parse(res.body);
    }

    async deleteSiteProductVariant(product_id, variant_id) {
        let uri = `/admin/api/2020-01/products/${product_id}/variants/${variant_id}.json`;
        let res = await this.shopifyHttp.httpDelete(uri);
    }

    // --------------------------------------------------------------------------------------------------
    // Custom collections

    async getSiteCustomCollections() {

        let uri = this.shopifyHttp.apiPaths.custom_collections;
        let arrSiteCollections = new Array();

        await this.shopifyHttp.httpGetPaginated(uri, async responseChunk => {

            let siteCollections = JSON.parse(responseChunk.body).custom_collections;

            if (Array.isArray(siteCollections))
                arrSiteCollections.push(...siteCollections);
            else
                arrSiteCollections.push(siteCollections);

        });

        return arrSiteCollections;

    }

    async getSiteCustomCollectionMetaData(collectionId) {

        let metafiledsUri = this.shopifyHttp.apiPaths.custom_collections_metafields_get;
        let resp = await this.shopifyHttp.httpGet(metafiledsUri, collectionId);
        return JSON.parse(resp.body);

    }

    async deleteSiteCustomCollection(id) {
        return this.shopifyHttp.httpDelete(this.shopifyHttp.apiPaths.custom_collections_delete, id);
    }

    async addSiteCustomCollection(title) {
        //let uri = "/admin/api/2019-07/custom_collections.json";//this.shopifyHttp.apiPaths.custom_collections_post;
        let uri = this.shopifyHttp.apiPaths.custom_collections_post;
        let postData = {custom_collection: {title: title} };
        let res = await this.shopifyHttp.httpPost(uri, postData, '', 201);

        try {
            res = JSON.parse(res.body).custom_collection;
        }
        catch (e) {
            let msg = 'addSiteCustomCollection: unable to parse server response. ' + e.message;
            throw new Error(msg);
        }

        return res;
    }

    async addSiteCustomCollectionMetaField(collectionId, metafield) {
        let uri = this.shopifyHttp.apiPaths.custom_collections_metafields_post;
        return this.shopifyHttp.httpPost(uri, metafield, collectionId ,201);
    }

    // --------------------------------------------------------------------------------------------------
    // Collects

    async getSiteCollects() {

        let uri = this.shopifyHttp.apiPaths.collects_get;
        let arrSiteCollects = [];

        await this.shopifyHttp.httpGetPaginated(uri, async responseChunk => {

            let siteProducts = JSON.parse(responseChunk.body).collects;

            if (Array.isArray(siteProducts))
                arrSiteCollects.push(...siteProducts);
            else
                arrSiteCollects.push(siteProducts);

        });

        return arrSiteCollects;

    }

    async addSiteCollect(collectData) {
        let uri = this.shopifyHttp.apiPaths.collects_post;
        return this.shopifyHttp.httpPost(uri, collectData,'',201);
    }

    async deleteSiteCollect(collectID) {
        let uri = this.shopifyHttp.apiPaths.collects_delete;
        return this.shopifyHttp.httpDelete(uri, collectID, 200);
    }

    // --------------------------------------------------------------------------------------------------
    // Inventory

    async getSiteInventoryDefaultLocationId() {
        let uri = this.shopifyHttp.apiPaths.inventory_location_get;
        let res = await this.shopifyHttp.httpGet(uri);
        return JSON.parse(res.body).locations[0].id;
    }

    async updateSiteInventoryData(inventoryData) {
        let uri = this.shopifyHttp.apiPaths.inventory_levels_set_post;
        return this.shopifyHttp.httpPost(uri, inventoryData, '', 200);
    }

    // ------------------------------------------------------------------------------------------------------
    // Other

    async sleep(timeout) {

        return new Promise(resolve => {

            setTimeout(() => resolve, timeout);

        });

    }

    createLogger(logPrefix) {

        return function () {
            console.log((new Date()).toLocaleTimeString('ru-RU')
                ,'ModelShopify::'+logPrefix, ...arguments);
        }

    }

}

module.exports = ModelShopify;

