const fs = require('fs');
//const ViewSupplyPricesRender = require('./ViewSupplyPricesRender');

class ModelSupplyPrices {

    constructor(objModelCatalogue) {
        this.db = objModelCatalogue.db;
        this.dbTables = objModelCatalogue.dbTables;
    }

    async createCategoryBasedPrices(pictureDirName, asyncCallbackRenderFunction) {

        // Initialization
        const FUNC_NAME = 'createCategoryBasedPrice';
        const log = this.createLogger(FUNC_NAME);
        log('Started');

        // Prepare list of categories
        let categoriesList = await this.getPreparedCategoriesList();

        for (let elCategory of categoriesList) {
            // Query category content
            let resultSetProducts = await this.getCategoryProducts(elCategory.id, pictureDirName).catch(err => {
                this.throwException(FUNC_NAME, err.message);
            });

            let renderSourceData = {
                products: resultSetProducts.products,
                product_variants: resultSetProducts.product_variants,
                product_pictures: resultSetProducts.product_pictures,
                title: elCategory.title
            };

            log('Building price', elCategory.title);

            try {
                await asyncCallbackRenderFunction(renderSourceData);
            } catch (err) {
                let msg = 'Render function error: ' + err.message;
                this.throwException(FUNC_NAME, msg);
            }

        }

        log('Done');

    }

    async createTopNPrices(topLimit ,pictureDirName, asyncCallbackRenderFunction) {

        // Initialization
        const FUNC_NAME = 'createTop500Prices';
        const log = this.createLogger(FUNC_NAME);
        log('Started');

        let resultSet = await this.getTopNPriceProducts(pictureDirName, topLimit).catch(err => {
            this.throwException(FUNC_NAME, err.message);
        });

        try {
            await asyncCallbackRenderFunction(resultSet);
        } catch (err) {
            let msg = 'Render function error: ' + err.message;
            this.throwException(FUNC_NAME, msg);
        }

        log('Done');

    }

    ////////////////////////////////////////////////////////////////////////////
    // Internal API

    async getPreparedCategoriesList(productsInCategoryLimit) {

        // Logs/exceptions
        const FUNC_NAME = 'getCategoryTree';

        // Initialization
        const db = this.db;
        const dbTables = this.dbTables;

        // Query categories with count of products from DB
        let rsCategories = await db.query(` 
        
            SELECT 
            	categories.id, 
                categories.title
            FROM 
            	${dbTables.categories} categories  
            WHERE
            	level = 2 
                AND id IN (
            		SELECT 
            			category_id
            		FROM 
            			${dbTables.product_categories} prod_cat
            		WHERE 
            			product_id IN (
            				SELECT product_id FROM ${dbTables.view_pdf_supply_prices_products} product
            			)
                );
                      
                       
        `).catch(err => {
            let msg = `Unable to query categories from db. SQL ERR: ${err.message}`;
            this.throwException(msg);
        });

        return rsCategories;

    }

    async getCategoryProducts(categoryId, pictureDirrectory) {

        // Initialization
        const FUNC_NAME = 'getCategoryProducts';
        const db = this.db;
        const dbTables = this.dbTables;

        let queryResultSet = await db.query(`
            
            CREATE TEMPORARY TABLE tmp_product_ids AS
            SELECT 
                prod_variants.product_id, 
                prod_variants.product_variant_id
            FROM 
                ${dbTables.view_pdf_supply_prices_products_variants} prod_variants
            
            WHERE
                prod_variants.product_id IN (
                    SELECT product_id FROM ${dbTables.product_categories} WHERE category_id = ?
                )
            ;
                    
            --  best seller compare
            CREATE TEMPORARY TABLE tmp_products_sales_ranks
            SELECT 
                product_id, year_sales_count sales_rank
            FROM 
                ${dbTables.products_supply_price_data}
            WHERE 
                product_id IN (
                    SELECT product_id FROM tmp_product_ids
                );
                            
            SET @MIN_RANK := (SELECT MIN(sales_rank) FROM tmp_products_sales_ranks);
            SET @MAX_RANK := (SELECT MAX(sales_rank + @MIN_RANK*2) FROM tmp_products_sales_ranks); 
           
            CREATE TEMPORARY TABLE tmp_best_seller_compare
            SELECT 
            	product_id,
            	
            	CASE
            	    WHEN (@MAX_RANK * 2) = 0 
            	        THEN 0
            	    ELSE 
                        (sales_rank + @MIN_RANK*2) / @MAX_RANK 
                END best_seller_compare
                   
            FROM 
            	tmp_products_sales_ranks;
           
            -- products
            SELECT 
                p.id, p.sku, p.material, p.weight, p.volume,
                tmp_best_seller_compare.best_seller_compare,
                
                price.year_sales_count,
                price.minimal_order_quantity,
                price.price_cny_exw_yiwu,
                price.price_usd_fob_ningbo,
                price.price_eur_ddp_warsaw,
                price.price_pln_ddp_warsaw,
                price.price_uds_ddp_nyc,
                price.price_rub_ddp_moscow,
                price.price_uah_ddp_odessa,
                price.price_hkd_ddp_hong_kong
                
            FROM (
                    SELECT * 
                    FROM ${dbTables.products}
                    WHERE id IN (SELECT product_id FROM tmp_product_ids) 
                ) p
                
                    JOIN ${dbTables.products_supply_price_data} price
                    ON price.product_id = p.id
                
                    LEFT JOIN tmp_best_seller_compare
                    ON tmp_best_seller_compare.product_id = p.id; 
            
            -- products_variants
            SELECT 
                product_variants.id,
                product_variants.product_id,
                product_variants.color,
                product_variants.size,
                product_variants.barcode
            FROM 
                ${dbTables.product_variants} product_variants, 
                tmp_product_ids
            WHERE 
                product_variants.id = tmp_product_ids.product_variant_id;
                
            -- products_pictures
            SELECT 
            	product_id, 
                fn_picture_url(uri) url 
            FROM 
                product_pictures
            WHERE 
            	product_id IN (
            		SELECT product_id FROM tmp_product_ids
            	)
                AND directory = ?
            ORDER BY
            	product_id, pic_order
            ;
                
            DROP TABLE tmp_product_ids; 
            DROP TABLE tmp_products_sales_ranks;
            DROP TABLE tmp_best_seller_compare;            
        
        `, [categoryId, pictureDirrectory]).catch(err => {
            let msg = 'SQL ERR. Unable to query products. Err: ' + err.message;
            this.throwException(FUNC_NAME, msg);
        });

        let resultIndexOffset = queryResultSet.length - 3;
        return {
            product_pictures: queryResultSet[--resultIndexOffset],
            product_variants: queryResultSet[--resultIndexOffset],
            products: queryResultSet[--resultIndexOffset].sort((a, b) => {
                if (a.sku == b.sku)
                    return 0
                else
                    return Number(a.sku) > Number(b.sku) ? 1 : -1;
            })

        };

    }

    async getTopNPriceProducts(pictureDirectory, topLimit) {

        const FUNC_NAME = 'getTop500PriceProducts';

        if (isNaN(topLimit)) {
            this.throwException(FUNC_NAME, 'Parameter topLimit must be a number');
        }

        /*
         В каждой выборке должен быть бестселлер - тогда тут пишется бестселлер (позиция с наибольшим колличеством
         продаж за последние 1000 дней), остальные имеют %% от него равный: продажи текущего артикла за последние
         1000 дней/продажи бестселлера за последние 1000 дней.

         Всем позициям,включая бестселлер при начале расчета добавляется к текущим продажам 2 минимума по категории.
         */

        const db = this.db;
        const dbTables = this.dbTables;

        let queryResultSet = await db.query(`
    
            CREATE TEMPORARY TABLE tmp_product_ids AS
            SELECT
                prod_variants.product_id,
                prod_variants.id product_variant_id          
            FROM 
                product_variants prod_variants
            WHERE
                prod_variants.not_supplied = 0             
                AND prod_variants.product_id IN (                
                    SELECT product_id 
                    FROM products_supply_price_data
                    WHERE product_id IN (
                        SELECT product_id FROM product_categories
                    )                   
                ) 
            ;
            
            CREATE TEMPORARY TABLE tmp_top_n_products AS
            SELECT 
            	product_id, year_sales_count sales_rank
            FROM
            	products_supply_price_data
            ORDER BY
            	year_sales_count DESC
            LIMIT ${topLimit};
                
            SET @MIN_RANK := (SELECT MIN(sales_rank) FROM tmp_top_n_products);
            SET @MAX_RANK := (SELECT MAX(sales_rank + @MIN_RANK*2) FROM tmp_top_n_products);
            
            CREATE TEMPORARY TABLE tmp_best_seller_compare
            SELECT 
            	product_id,
                (sales_rank + @MIN_RANK*2) / @MAX_RANK best_seller_compare    
            FROM 
            	tmp_top_n_products;
            	
            /*
            * RESULTS
            */
            
             -- products
            SELECT 
                p.id, p.sku, p.material, p.weight, p.volume,           
                tmp_best_seller_compare.best_seller_compare,
                price.year_sales_count,
                price.minimal_order_quantity,
                price.price_cny_exw_yiwu,
                price.price_usd_fob_ningbo,
                price.price_eur_ddp_warsaw,
                price.price_pln_ddp_warsaw,
                price.price_uds_ddp_nyc,
                price.price_rub_ddp_moscow,
                price.price_uah_ddp_odessa,
                price.price_hkd_ddp_hong_kong
            FROM 
                tmp_best_seller_compare, 
                ${dbTables.products} p,
                ${dbTables.products_supply_price_data} price
            WHERE
                 tmp_best_seller_compare.product_id = p.id
                 AND p.id = price.product_id;
                 
              -- products_variants
            SELECT 
                product_variants.id,
                product_variants.product_id,
                product_variants.color,
                product_variants.size,
                product_variants.barcode
            FROM 
                ${dbTables.product_variants} product_variants, 
                tmp_best_seller_compare
            WHERE 
                tmp_best_seller_compare.product_id = product_variants.product_id
                AND product_variants.id IN (
                    SELECT product_variant_id FROM tmp_product_ids
                );
                
            -- products_pictures
            SELECT 
            	product_id, 
                fn_picture_url(uri) url 
            FROM 
                product_pictures
            WHERE 
            	product_id IN (
            		SELECT product_id FROM tmp_best_seller_compare
            	)
                AND directory = ${ db.escape(pictureDirectory) }
            ORDER BY
            	product_id, pic_order
            ;
            
            /*
            * Clear temp
            */
            
            DROP TABLE tmp_product_ids;
            DROP TABLE tmp_top_n_products;
            DROP TABLE tmp_best_seller_compare;
        
        `).catch(err => {
            let msg = 'SQL ERR. Unable to query products. Err: ' + err.message;
            this.throwException(FUNC_NAME, msg);
        });

        let resultIndexOffset = queryResultSet.length - 3;
        return {
            product_pictures: queryResultSet[--resultIndexOffset],
            product_variants: queryResultSet[--resultIndexOffset],
            products: queryResultSet[--resultIndexOffset]

        };

    }

    ////////////////////////////////////////////////////////////////////////////
    // Service methods

    throwException(functionName, message) {
        let msg = `ModelSupplyPrices::${functionName} ERROR: ${message}`;
        throw new Error(msg);
    }

    createLogger(logPrefix) {
        return function () {
            console.log((new Date()).toLocaleTimeString('ru-RU')
                ,'ModelSupplyPrices::'+logPrefix, ...arguments);
        }
    }

}

module.exports = ModelSupplyPrices;