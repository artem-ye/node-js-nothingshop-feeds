class ModelCatalogue {

    constructor(db) {
        this.db = db;
        this.dbTables = {
            categories: 'categories',
            products: 'products',
            product_variants: 'product_variants',
            product_categories: 'product_categories',
            product_pictures: 'product_pictures',
            feedFullCSV: 'vw_feedFullCSV',
            feedInventoryCSV: 'vw_feedInventoryCSV',
            products_supply_price_data: 'products_supply_price_data',

            view_pdf_supply_prices_products: 'vw_pdf_supply_prices_products',
            view_pdf_supply_prices_products_variants: 'vw_pdf_supply_prices_products_variants',

        }
        this.IMG_URL_PREFIX = 'http://img.nothingshop.com/';
    }


    // *************************************************************************************************
    // Categories

    async deleteCategory(id) {

        const sql = `DELETE FROM ${this.dbTables.categories} WHERE id=${id}`;
        return this.db.query(sql, id);

    }

    async insertCategory(title, parent_id=undefined) {

        let args = [title];
        let sqlFields = 'title';
        let sqlVals = "?";

        if (parent_id !== undefined) {
            args.push(parent_id);
            sqlFields += ",parent_id";
            sqlVals += ",?"
        }

        const sql = `INSERT INTO ${this.dbTables.categories} (${sqlFields}) VALUES (${sqlVals})`;
        return this.db.query(sql, args);

    }

    async updateCategoryLevels() {
        const sql = 'call goods_feed.sp_update_categories_levels(); ';
        return this.db.query(sql, "");
    }

    // *************************************************************************************************
    // Products

    async insertProduct(objProduct) {

        let sqlFields = '';
        let sqlVals = '';
        let args = [];

        for (let [field, val] of Object.entries(objProduct)) {

            if (field == 'id')
                continue;

            sqlFields += ","+field;
            sqlVals += ",?";
            args.push(val);
        }

        sqlFields = sqlFields.substr(1);
        sqlVals = sqlVals.substr(1);
        const sql = `INSERT INTO ${this.dbTables.products} (${sqlFields}) VALUES (${sqlVals})`;
        return await this.db.query(sql, args);

    }

    async updateProductById(objProduct, id) {

        let args = [];
        let sqlSetFields = '';

        for (let [field, val] of Object.entries(objProduct)) {

            if (field == 'id')
                continue;

            sqlSetFields += `,${field} = ?`;
            args.push(val);
        }

        sqlSetFields = sqlSetFields.substr(1);
        args.push(id);
        const sql = `UPDATE ${this.dbTables.products} SET ${sqlSetFields} WHERE ( id= ${id})`;
        return this.db.query(sql, args);

    }

    // *************************************************************************************************
    // Product variants

    async insertProductVariant(objProductVariant, product_id) {

        let sqlFields = '';
        let sqlVals = '';
        let args = [];

        for (let [field, val] of Object.entries(objProductVariant)) {

            if (field == 'id' || field == 'product_id')
                continue;

            sqlFields += ","+field;
            sqlVals += ",?";
            args.push(val);
        }

        sqlFields += ",product_id";
        sqlVals += ",?";
        args.push(product_id);

        sqlFields = sqlFields.substr(1);
        sqlVals = sqlVals.substr(1);
        const sql = `INSERT INTO ${this.dbTables.product_variants} (${sqlFields}) VALUES (${sqlVals})`;
        return this.db.query(sql, args);

    }

    async updateProductVariantById(objProductVariant, id) {

        let args = [];
        let sqlSetFields = '';

        for (let [field, val] of Object.entries(objProductVariant)) {

            if (field == 'id')
                continue;

            sqlSetFields += `,${field} = ?`;
            args.push(val);
        }

        sqlSetFields = sqlSetFields.substr(1);
        args.push(id);
        const sql = `UPDATE ${this.dbTables.product_variants} SET ${sqlSetFields} WHERE ( id= ${id})`;
        return this.db.query(sql, args);

    }

    async updateProductVariantInventoryData(objProductVariant) {
    let keyFieldName;
    let keyFieldValue;

        if (objProductVariant.id) {
            keyFieldName = 'id';
        } else {
            keyFieldName = 'barcode';
        }

        keyFieldValue = objProductVariant[keyFieldName];

        if (objProductVariant[keyFieldName] == undefined) {
            let msg = `ModelCatalogue::updateProductVariantInventoryData: key fields (id or barcode) not provided in ${JSON.stringify(objProductVariant)}`;
            throw new Error(msg);
        }

        if (keyFieldValue == '') {
            let msg = `ModelCatalogue::updateProductVariantInventoryData: key field ${keyFieldName} value is empty ${JSON.stringify(objProductVariant)}`;
            throw new Error(msg);
        }

        let args = [];
        let sqlSetFields = '';

        for (let [field, val] of Object.entries(objProductVariant)) {

            if (field == keyFieldName) continue;

            sqlSetFields += `,${field} = ?`;
            args.push(val);
        }

        sqlSetFields = sqlSetFields.substr(1);
        args.push(keyFieldValue);

        let sql = `
        UPDATE ${this.dbTables.product_variants} 
        SET ${sqlSetFields} 
        WHERE ${keyFieldName} = '${keyFieldValue}'`;

        return this.db.query(sql, args);

    }

    async updateProductVariantsInventoryDataFromArray(arrProductVariants) {
    let sql;

        const ERR_PREFIX = 'ModelCatalogue::updateProductVariantsInventoryDataFromArray';

        const sql_tmp_table_name = 'tmp_update_inventory_data';

        // Creating sql tmp table, to store arrProductVariants.
        // In the end it will help us
        // to find product variants, which was not listed in file
        // We will reset inventory data to zero in this product variants
        // which was not listed in xml
        sql = `
        DROP TABLE IF EXISTS ${sql_tmp_table_name};
        CREATE TEMPORARY TABLE ${sql_tmp_table_name} AS  
        SELECT barcode, ru_price, ru_inventory_qty, ru_price_with_discount, ru_discount_percent, not_supplied 
        FROM product_variants 
        LIMIT 0;`;

        await this.db.query(sql).catch(err => {
            let msg = ERR_PREFIX + ' DB ERR: Unable to create tmp table: tmp_update_inventory_data. Err: ' + err.message;
            throw new Error(msg);
        });

        // Inserting arrProductVariants into tmp SQL table
        for (let elProdVariant of arrProductVariants) {
            sql = `
            INSERT INTO ${sql_tmp_table_name} 
                (barcode, ru_price, ru_inventory_qty, ru_price_with_discount, ru_discount_percent, not_supplied) 
            VALUES (?, ?, ?, ?, ?, ?)`;

            let sqlParams = [
                elProdVariant.barcode,
                elProdVariant.ru_price,
                elProdVariant.ru_inventory_qty,
                elProdVariant.ru_price_with_discount,
                elProdVariant.ru_discount_percent,
                elProdVariant.not_supplied
            ];

            await this.db.query(sql, sqlParams)
                .catch((err) => console.log(ERR_PREFIX + ' DB ERR: ' + err.message));
        }

        // Detecting product variants, which must be updated
        sql = `           
        SELECT  
            prod_var.id, 
            tmp.ru_inventory_qty, 
            tmp.ru_price, 
            tmp.ru_price_with_discount, 
            tmp.ru_discount_percent, 
            tmp.not_supplied
                     
        FROM    
            ${this.dbTables.product_variants} AS prod_var 
            
            JOIN ${sql_tmp_table_name} tmp
            ON tmp.barcode = prod_var.barcode
            
        WHERE
             (tmp.ru_price <> prod_var.ru_price 
             OR tmp.ru_inventory_qty <> prod_var.ru_inventory_qty
             OR tmp.ru_price_with_discount <> prod_var.ru_price_with_discount
             OR tmp.ru_discount_percent <> prod_var.ru_discount_percent
             OR tmp.not_supplied <> prod_var.not_supplied)
        `;

        let rsChangedData = await this.db.query(sql)
            .catch(err => {
                let msg = ERR_PREFIX + ' DB ERR: ' + err.message;
                throw new Error(msg);
            });

        console.log('Updating ' + rsChangedData.length + ' records');

        // Updating SQL DB
        for (let changedRow of rsChangedData) {

            await this.updateProductVariantInventoryData(changedRow)
                .catch(err => {
                    let msg = ERR_PREFIX + " DB ERR: Inventory data update failed. Msg" + err.message + " inventory data:  " + JSON.stringify(changedRow);
                    console.log(msg);
                });
        }

        // Resetting product variants, which was not listed in parameter array
        sql = `
        UPDATE product_variants AS dst
            
            JOIN ( 
                SELECT id 
                FROM product_variants 
                WHERE barcode NOT IN (SELECT barcode FROM ${sql_tmp_table_name}) 
            ) AS src
            ON dst.id = src.id
    
        SET dst.ru_price = 0, dst.ru_inventory_qty = 0
        `;

        let res = await this.db.query(sql)
            .catch(err => console.log(ERR_PREFIX + " DB ERR!!! Product variants reset query failed: " + err.message));

        console.log('' + res.changedRows + ' product variants reset');

        await this.db.query(`DROP TABLE ${sql_tmp_table_name}`)
            .catch(err => console.log("DB ERR!!!" + err.message));

    }


    async deleteProductVariant(id) {

        const sql = `DELETE FROM ${this.dbTables.product_variants} WHERE id=${id}`;
        return this.db.query(sql, id);

    }

    // *************************************************************************************************
    // Product pictures

    async insertProductPicture(objProductPicture, product_id) {

        let sqlFields = '';
        let sqlVals = '';
        let args = [];

        for (let [field, val] of Object.entries(objProductPicture)) {

            if (field == 'id' || field == 'product_id')
                continue;

            sqlFields += ","+field;
            sqlVals += ",?";
            args.push(val);
        }

        sqlFields += ",product_id";
        sqlVals += ",?";
        args.push(product_id);

        sqlFields = sqlFields.substr(1);
        sqlVals = sqlVals.substr(1);
        const sql = `
        INSERT INTO ${this.dbTables.product_pictures} (${sqlFields}) VALUES (${sqlVals});
        
        UPDATE	
            ${this.dbTables.product_pictures} AS target,
            (SELECT 
                id, 
                RANK() OVER (PARTITION BY product_id, directory ORDER BY directory, uri) AS pic_order
            FROM 
                ${this.dbTables.product_pictures}
            WHERE
		        product_id = ${product_id}
            ) AS src
        SET
            target.pic_order = src.pic_order
        WHERE
            target.id = src.id          
                
        `;


        return this.db.query(sql, args);

    }

    async deleteProductPicture(id) {

        const sql = `DELETE FROM ${this.dbTables.product_pictures} WHERE id=${id}`;
        return this.db.query(sql, id);

    }

    // *************************************************************************************************
    // Product categories

    async deleteProductFromCategory(productCategoryId) {
        const sql = `DELETE FROM ${this.dbTables.product_categories} WHERE id=${productCategoryId}`;
        return this.db.query(sql, productCategoryId);
    }

    async addProductToCategory(product_id, category_id) {
        const sql = `INSERT INTO ${this.dbTables.product_categories} (product_id, category_id) VALUES (${product_id}, ${category_id})`;
        return this.db.query(sql, []);
    }

    // *************************************************************************************************
    // Supply prices

    async updateProductsSupplyPricesDataFromArray(arrProduct) {

        const db = this.db;
        const ERR_PREFIX = 'ModelCatalogue::updateProductsSupplyPricesDataFromArray';
        const log = this.createLogger('updateProductsSupplyPricesDataFromArray');
        const sql_tmp_table_name = 'tmp_update_supply_prices';

        const checkFieldsList = [
            "base_supply_price_cny",
            "price_cny_exw_yiwu",
            "price_usd_fob_ningbo",
            "price_eur_ddp_warsaw",
            "price_uds_ddp_nyc",
            "price_rub_ddp_moscow",
            "price_uah_ddp_odessa",
            "price_hkd_ddp_hong_kong",
            "price_pln_ddp_warsaw",
            "minimal_order_quantity"
        ];

        // Create SQL Temporary table.
        // It helps to find products by sku
        // and delete db records which was not listed in XML file
        db.query(`
            
            DROP TABLE IF EXISTS ${sql_tmp_table_name};
            
            CREATE TEMPORARY TABLE ${sql_tmp_table_name} AS  
            SELECT sku 
            FROM products 
            LIMIT 0;
            
            ALTER TABLE ${sql_tmp_table_name} 
            ADD COLUMN slice_id INT NULL,
            ADD COLUMN product_id INT UNSIGNED NULL;
            
        `).catch(err => {
            throw new Error(`${ERR_PREFIX} SQL Error. Unable to create tmp table. ERR: ${err.message} `);
        });

        // Updating DB
        const arrLength = arrProduct.length;
        const RECORDS_PER_QUERY_LIMIT =1000; // Max records per query

        // Split XML file into slices by RECORDS_PER_QUERY_LIMIT records
        for (let sliceId=0, startIdx=0; startIdx <= arrLength; sliceId++, startIdx+=RECORDS_PER_QUERY_LIMIT ) {

            let endIdx = Math.min(startIdx+(RECORDS_PER_QUERY_LIMIT-1), arrLength-1);
            //console.log('Slice', sliceId, 'Start Idx', startIdx, 'End Idx', endIdx);
            log('Processing XML Data; Slice', sliceId+1, 'of', Math.round(arrLength/RECORDS_PER_QUERY_LIMIT),
                '(Start Idx', startIdx, 'End Idx', endIdx+')');

            // Insert products sku into tmp sql table
            for (let i=startIdx; i<=endIdx; i++) {
                let xmlProduct = arrProduct[i];

                await db.query(`
                                    
                    INSERT INTO ${sql_tmp_table_name} 
                        (slice_id, sku)
                    VALUES (
                        ${sliceId}, 
                        ${db.escape(xmlProduct.sku)}
                    )
                
                `).catch(err =>{
                    throw new Error(`${ERR_PREFIX} SQL Error. Unable to INSERT into temporary table 
                    ${sql_tmp_table_name}. DB ERR: ${err.message} `);
                });
            }

            // Detect product ids by sku.
            // Clear records without product_id
            await db.query(`

                UPDATE ${sql_tmp_table_name}  AS src
                JOIN products p
                ON src.slice_id = ${sliceId} AND p.sku = src.sku
                SET src.product_id = p.id;
                                    
                DELETE FROM ${sql_tmp_table_name} 
                WHERE slice_id = ${sliceId} AND product_id IS NULL 
            
            `).catch(err =>{
                throw new Error(`${ERR_PREFIX} SQL Error. Unable to UPDATE temporary table 
                    ${sql_tmp_table_name}. DB ERR: ${err.message} `);
            });

            // Query db data to compare with xml file data
            let dbData = await db.query(`
                
                SELECT 
                    tmp.sku, tmp.product_id,
                    
                    CASE
                        WHEN t.product_id IS NULL 
                            THEN 0
                        ELSE 1
                    END price_data_record_exists,
                    
                    ${ checkFieldsList.map(el => 't.'+el).join(",") } 
                    
                FROM (   
                        SELECT sku, product_id 
                        FROM ${sql_tmp_table_name}
                        WHERE slice_id = ${sliceId}
                    ) tmp
                    
                    LEFT JOIN products_supply_price_data t
                    ON t.product_id = tmp.product_id
            
            `).catch(err =>{
                throw new Error(`${ERR_PREFIX} SQL Error. Unable to update DB. ERR: ${err.message} `);
            });

            // Updating DB
            for (let dbRecord of dbData) {

                let findResXmlProduct = arrProduct.find(el => el.sku == dbRecord.sku);

                if (findResXmlProduct == undefined) {
                    console.log(`ERR: SKU '${dbRecord.sku}' not found.`);
                    continue;
                }

                delete findResXmlProduct.sku;
                findResXmlProduct.product_id = dbRecord.product_id;

                // Insert new record
                if (! dbRecord.price_data_record_exists) {
                    await this.insertProductsSupplyPriceData(findResXmlProduct).catch(err => {
                        throw new Error(`${ERR_PREFIX} SQL Error. Unable to INSERT DB. ERR: ${err.message} `);
                    });
                }
                // Update existing records, if data difference detected
                else {
                    let isNeedUpdate = checkFieldsList.find(
                        fieldName =>  dbRecord[fieldName] != findResXmlProduct[fieldName]
                    );

                    if (isNeedUpdate != undefined) {
                        await this.updateProductsSupplyPriceData(findResXmlProduct).catch(err => {
                            throw new Error(`${ERR_PREFIX} SQL Error. Unable to UPDATE DB. ERR: ${err.message} `);
                        });
                    }
                }

            }

        }

        // Delete db records, which not listed in xml file
        db.query(`
            
            DELETE FROM products_supply_price_data
            WHERE product_id NOT IN (SELECT product_id FROM ${sql_tmp_table_name});
            
            DROP TABLE ${sql_tmp_table_name};
        `).catch(err => {
            throw new Error(`${ERR_PREFIX} SQL Error. Unable to clear not listed in xml records. ERR: ${err.message} `);
        });

    }

    async insertProductsSupplyPriceData(data) {

        let fields = Object.keys(data).join(",");
        let values = Object.values(data).map(el => this.db.escape(el)).join(",");

        let sql = `
            INSERT INTO products_supply_price_data 
                (${fields})
            VALUES 
                (${values})   
        `;

        return this.db.query(sql);

    }

    async updateProductsSupplyPriceData(data) {

        let setStr = Object.entries(data).reduce((accum, [key, val]) => {
            return (key != 'product_id' ? [...accum, key + '=' + this.db.escape(val)] : accum);
        }, []).join(",");


        let sql = `
            UPDATE products_supply_price_data 
            SET ${setStr}
            WHERE product_id = ${ this.db.escape(data.product_id) }
        `;

        //console.log(sql);
        return this.db.query(sql);

    }

    // *************************************************************************************************
    // Static feeds

    async getCategoriesForStaticFeed() {

        let rs = await this.db.query(`SELECT id, parent_id, title FROM ${this.dbTables.categories}`);

        // Delete parent_id attribute from root categories
        return  rs.map(el => {
            if (! el.parent_id) {
                delete el.parent_id;
            }
            return el;
        });

    }

    async getProductsForStaticFeed() {

        console.log('ModelCatlogue: Executing query');

        let tmpTableName = "tmp_valid_product_variants";
        let sql =`
        CREATE TEMPORARY TABLE ${tmpTableName}
        
        SELECT 
            product_variant_id, product_id            
        FROM (
            SELECT id product_variant_id, product_id
            FROM ${this.dbTables.product_variants} variants
            WHERE IFNULL(ru_price, 0) > 0 
                AND IFNULL(ru_inventory_qty, 0) > 0
                AND IFNULL(ru_discount_percent, 0) <= 50
        ) t              
        WHERE 
            product_id IN (SELECT product_id FROM product_categories)
            AND product_id IN (SELECT product_id FROM product_pictures)
        ;                              
        
        SELECT * FROM ${this.dbTables.products} 
        WHERE id IN (SELECT product_id FROM ${tmpTableName});
        
        SELECT * FROM ${this.dbTables.product_variants} 
        WHERE id IN (SELECT product_variant_id FROM ${tmpTableName});
        
        SELECT * FROM ${this.dbTables.product_categories} 
        WHERE product_id IN (SELECT product_id FROM ${tmpTableName});               
        
        SELECT DISTINCT product_id, directory FROM ${this.dbTables.product_pictures} 
        WHERE product_id IN (SELECT product_id FROM ${tmpTableName});
        
        SELECT product_id, directory, fn_picture_url(uri) url
        FROM ${this.dbTables.product_pictures}
        WHERE product_id IN (SELECT product_id FROM ${tmpTableName})
        ORDER BY product_id;
                       
        
        DROP TABLE ${tmpTableName};`;

        let queryResults = await this.db.query(sql);

        console.log('ModelCatlogue: Extracting query results');

        // Extracting record sets from results
        queryResults.shift();
        let rsProducts = queryResults.shift();
        let rsProductVariants = queryResults.shift();
        let rsProductCategories = queryResults.shift();
        let rsProductPicturesDirectories = queryResults.shift();
        let rsProductPictures = queryResults.shift();

        console.log('ModelCatlogue: Mapping query results');

        rsProducts.forEach(elProduct => {

            elProduct.productVariants = rsProductVariants
                .filter(elVariant => elVariant.product_id == elProduct.id);

            elProduct.productCategories = rsProductCategories
                .filter(elCategory => elCategory.product_id == elProduct.id)
                .map(el => {
                    return el.category_id;
                });

            let arrAllProdPictures =  rsProductPictures
                .filter(elPic => elPic.product_id == elProduct.id);


            let arrProdPictures = rsProductPicturesDirectories
                .filter(elPictureDir => elPictureDir.product_id == elProduct.id)
                .map(elPictureDir => {

                    let arrDirectoryPictures = arrAllProdPictures
                        .filter(elPic => elPic.directory == elPictureDir.directory)
                        .map(elPic => {
                            return {url: elPic.url}
                        });

                    return {
                        directory: elPictureDir.directory,
                        pictures: arrDirectoryPictures
                    }
                });

            elProduct.productPictures = arrProdPictures;

        });

        return rsProducts;
    }


    async getDataStaticFeedFullCSV() {

        let sql =`SELECT * FROM ${this.dbTables.feedFullCSV}`;
        return this.db.query(sql);

    }

    async getDataStaticFeedInventoryCSV() {

        let sql =`SELECT * FROM ${this.dbTables.feedInventoryCSV}`;
        return this.db.query(sql);

    }

    // *************************************************************************************************
    // CDEK YML feeds

    async getDataCdekFeed() {

        let sql = `
        
        CREATE TEMPORARY TABLE tmp_cdek_product_pictures
        SELECT
        	product_id,  
            pic_order,
            fn_picture_url(uri) url
            
        FROM 
        	product_pictures
        WHERE
        	directory = 'HD1600'
        ;
        
        /****************************************************************
        * PRODUCTS IDs
        ****************************************************************/
        
        CREATE TEMPORARY TABLE tmp_cdek_valid_product_ids AS
        SELECT 
        	product_id,
            id AS proudct_variant_id
        FROM
        	product_variants
        WHERE
        	ru_price > 0 
            AND ru_inventory_qty > 0
        	AND product_id IN (
        		SELECT DISTINCT
        			prod_cat.product_id
        		FROM
        			product_categories prod_cat,
                    tmp_cdek_product_pictures pics
                    
        		WHERE
        			pics.product_id = prod_cat.product_id
            )
        ;
        
        /****************************************************************
        * PRODUCTS CATEGORIES IDs
        ****************************************************************/
        
        CREATE TEMPORARY TABLE tmp_cdek_products_categories_with_levels AS
        SELECT
        	prod_cat.product_id, 
            prod_cat.category_id,
        	cat.level
            
        FROM (
        	SELECT
        		product_id, 
                category_id
            FROM
        		product_categories
        	WHERE
        		product_id IN (
        			SELECT DISTINCT product_id FROM tmp_cdek_valid_product_ids
        		)
        		
            ) prod_cat 
        	
        		JOIN categories cat
        		ON cat.id = prod_cat.category_id
        ;
        
        CREATE TEMPORARY TABLE tmp_cdek_products_categories_max_levels
        SELECT 
        	product_id, 
        	MAX(level) max_level
        FROM
        	tmp_cdek_products_categories_with_levels
        GROUP BY
        	product_id
        ;
        
        CREATE TEMPORARY TABLE tmp_cdek_products_categories
        SELECT
        	prod_cat_max_levels.product_id,
            MAX(prod_cats.category_id) category_id
        FROM
        	tmp_cdek_products_categories_max_levels prod_cat_max_levels
            
        		JOIN tmp_cdek_products_categories_with_levels prod_cats
                ON prod_cat_max_levels.product_id = prod_cats.product_id
                AND prod_cat_max_levels.max_level = prod_cats.level
                
        GROUP BY
        	prod_cat_max_levels.product_id
        ;
        
        /****************************************************************
        * RESULTS
        ****************************************************************/
        
        -- RESULT: CATEGORIES
        SELECT
        	id, 
        	title
        FROM
        	categories
        WHERE
        	id IN (SELECT DISTINCT category_id FROM tmp_cdek_products_categories)
        ;
        
        -- RESULTS: Products main fields
        SELECT
            prod.id AS product_id,
            
            prod_vars.barcode AS id,
            CONCAT(prod.vendor, '.', prod.sku, '-', prod.type) as type,
            CONCAT(prod.title) model,
            prod.vendor, 
            prod.type typePrefix,
            prod.sku as vendorCode,
            prod.title as name,
            
            prod_vars.ru_price_with_discount price_whith_discount,
            prod_vars.ru_price price,
            prod_vars.ru_inventory_qty amount,
            
            prod.description,
            prod_vars.barcode,
            (prod.weight / 1000) weight, 
            prod.sku group_id,    
                 
            prod.material param_material, 
            prod.wash param_wash, 
            prod_vars.color param_color,
            prod_vars.size param_size,
            prod_categories.category_id categoryId
            
        FROM (
        	SELECT * FROM product_variants 
        	WHERE id IN (
        		SELECT proudct_variant_id FROM tmp_cdek_valid_product_ids
        	)
        ) prod_vars
                 
        	JOIN products prod 
        	ON prod_vars.product_id = prod.id
        	
        	JOIN tmp_cdek_products_categories prod_categories
        	ON prod_categories.product_id = prod_vars.product_id
        ; 
        
         -- RESULT: PICTURES
        SELECT
        	product_id,
            url
        FROM
            tmp_cdek_product_pictures
        WHERE
        	product_id IN (SELECT product_id FROM tmp_cdek_valid_product_ids)
        ORDER BY
        	product_id, pic_order
        ;
        
        -- DROP TMP TABLES
        
        DROP TABLE tmp_cdek_products_categories_with_levels;
        DROP TABLE tmp_cdek_products_categories_max_levels;
        DROP TABLE tmp_cdek_products_categories;
        DROP TABLE tmp_cdek_valid_product_ids;
        DROP TABLE tmp_cdek_product_pictures;
        
        `;

        let resultSet = await this.db.query(sql).catch(err => {
            return Promise.reject(err);
        });

        let resultIndexOffSet = resultSet.length - 5;
        let recSetProductsPictures = resultSet[--resultIndexOffSet];
        let recSetProducts = resultSet[--resultIndexOffSet];
        let recSetCategories = resultSet[--resultIndexOffSet];

        let retVal = {
            categories: [],
            offers: []
        };

        retVal.categories = recSetCategories.map(elCategory => {

            if (elCategory.parent_id == null)
                delete elCategory.parent_id;

            return elCategory;

        });

        retVal.offers = recSetProducts.map(elProduct => {

            let mappedProduct = elProduct;

            // Remove service field product_id, we need it to filter
            // other record sets
            let productId = elProduct.product_id;
            delete mappedProduct.product_id;

            // Pictures
            mappedProduct.picture = recSetProductsPictures
                .filter(elPic => elPic.product_id == productId)
                .map(elPic => elPic.url);

            // Params
            const PARAM_ATTRIBUTE_PREFIX = 'param_';

            mappedProduct.params = {};
            Object.entries(mappedProduct).forEach((keyVal) => {

                let [key, val] = keyVal;

                if ( ! key.startsWith(PARAM_ATTRIBUTE_PREFIX) )
                    return;

                let keyWithoutPrefix = key.replace(PARAM_ATTRIBUTE_PREFIX, '');
                mappedProduct.params[keyWithoutPrefix] = val;
                delete mappedProduct[key];

            });

            /*
            mappedProduct.params = {};
            Object.keys(mappedProduct).filter(key => key.startsWith(PARAM_ATTRIBUTE_PREFIX))
                .forEach(key => {

                    let keyWithoutPrefix = key.replace(PARAM_ATTRIBUTE_PREFIX, '');
                    mappedProduct.params[keyWithoutPrefix] = mappedProduct[key];
                    delete mappedProduct[key];

                });
                */

            return mappedProduct;
        });

        return retVal;
    }

    // *************************************************************************************************
    // Ali Express Feeds

    async getDataAliExpressFeeds() {

        let sql = `
        
        CREATE TEMPORARY TABLE tmp_product_pictures
        SELECT
        	product_id,  
            pic_order,
            fn_picture_url(uri) url
            
        FROM 
        	product_pictures
        WHERE
        	directory = 'default'
        ;
        
        /****************************************************************
        * PRODUCTS IDs
        ****************************************************************/
        
        CREATE TEMPORARY TABLE tmp_valid_product_ids AS
        SELECT 
        	product_id,
            id AS proudct_variant_id
        FROM
        	product_variants
        WHERE
        	ru_price > 0 
            AND ru_inventory_qty > 0
        	AND product_id IN (
        		SELECT DISTINCT
        			prod_cat.product_id
        		FROM
        			product_categories prod_cat,
                    tmp_product_pictures pics
                    
        		WHERE
        			pics.product_id = prod_cat.product_id
            )
        ;
        
        /****************************************************************
        * PRODUCTS CATEGORIES IDs
        ****************************************************************/
        
        CREATE TEMPORARY TABLE tmp_products_categories_with_levels AS
        SELECT
        	prod_cat.product_id, 
            prod_cat.category_id,
        	cat.level,
            cat.title
            
        FROM (
        	SELECT
        		product_id, 
                category_id
            FROM
        		product_categories
        	WHERE
        		product_id IN (
        			SELECT DISTINCT product_id FROM tmp_valid_product_ids
        		)
        		
            ) prod_cat 
        	
        		JOIN categories cat
        		ON cat.id = prod_cat.category_id
        ;
        
        CREATE TEMPORARY TABLE tmp_products_max_levels
        SELECT 
        	product_id, 
        	MAX(level) max_level
        FROM
        	tmp_products_categories_with_levels
        GROUP BY
        	product_id
        ;
        
        CREATE TEMPORARY TABLE tmp_product_categories
        SELECT
        	tmp_products_max_levels.product_id,
            MAX(tmp_products_categories_with_levels.category_id) category_id
        FROM
        	tmp_products_max_levels
            
        		JOIN tmp_products_categories_with_levels
                ON tmp_products_max_levels.product_id = tmp_products_categories_with_levels.product_id
                AND tmp_products_max_levels.max_level = tmp_products_categories_with_levels.level
                
        GROUP BY
        	tmp_products_max_levels.product_id
        ;
        
        
        /****************************************************************
        * RESULTS
        ****************************************************************/
        
        -- RESULT: CATEGORIES
        SELECT
        	id,
        	title
        FROM
        	categories
        WHERE
        	id IN (SELECT DISTINCT category_id FROM tmp_product_categories)
        ;
        
        -- RESULT: PRODUCTS
        SELECT
            prod_vars.barcode AS id,
            
        	prod.id product_id, 
            prod.sku group_id,
            prod.sku sku,
            prod.vendor,
            prod.description,
            (prod.weight / 1000) weight, 
            prod.volume,
            prod.title, 
            prod.material, 
            prod.wash, 
            prod.type,
            
            prod_vars.color,
            prod_vars.size,
            prod_vars.ru_price price,
            prod_vars.ru_price_with_discount price_whith_discount,
        	prod_vars.ru_inventory_qty quantity,
        	prod_vars.barcode,
            
            prod_cats.category_id categoryId
            
        FROM (
        	SELECT * FROM product_variants 
        	WHERE id IN (
        		SELECT proudct_variant_id FROM tmp_valid_product_ids
        	)
        ) prod_vars
                 
        	JOIN products prod 
        	ON prod_vars.product_id = prod.id
            
            JOIN tmp_product_categories prod_cats
            ON prod_cats.product_id = prod.id
        ;
        
        -- RESULT: PICTURES
        SELECT
        	product_id,
            url picture
        FROM
            tmp_product_pictures
        WHERE
        	product_id IN (SELECT product_id FROM tmp_valid_product_ids)
        ORDER BY
        	product_id, pic_order
        ;
        
        DROP TABLE tmp_product_pictures;
        DROP TABLE tmp_valid_product_ids;
        DROP TABLE tmp_product_categories;
        DROP TABLE tmp_products_categories_with_levels;
        DROP TABLE tmp_products_max_levels;
        
        `;

        let resultSet = await this.db.query(sql);
        let resultIndex = resultSet.length - 5;

        let recSetPictures = resultSet[--resultIndex];
        let recSetProducts = resultSet[--resultIndex];
        let recSetCategories = resultSet[--resultIndex];

        let recSetOffers = recSetProducts.map(elProduct => {

            let offer = Object.assign(elProduct);

            // Converting volume (cm3) to dimensions (high, width, length)
            // extracting Cube root
            let lengthWidthHigh =  Math.exp( (1 / 3) * Math.log(offer.volume) );
            lengthWidthHigh = lengthWidthHigh.toPrecision(2);
            offer.length = lengthWidthHigh;
            offer.width = lengthWidthHigh;
            offer.height = lengthWidthHigh;
            delete offer.volume;

            offer.pictures = recSetPictures
                .filter(elPicture => elPicture.product_id == offer.product_id)
                .map(elPicture => {
                    delete elPicture.product_id;
                    return elPicture;
                });

            delete offer.product_id;
            return offer;

        });

        return  {
            categories: recSetCategories,
            offers: recSetOffers
        };

    }


    // *************************************************************************************************
    // Etc

    createLogger(funcName) {

        return (...args) => {
            console.log(`ModelCatalogue::${funcName}`, ...args);
        };

    }

}

module.exports.ModelCatalogue = ModelCatalogue;