const pdf = require('html-pdf');
//const translate = require('google-translate-api');

/**
 @typedef priceData
 @type {Object}
 @property {String} title - price title.
 @property {Array.<Object>} products - Array of objects product.
 @property {Array.<Object>} product_variants - Array of objects product_variants.
 @property {Array.<Object>} product_pictures - Array of objects product_pictures.
 */

class ViewSupplyPricesRender {

    /***
     *
     * @param {priceData} priceData
     * @param {String} path
     */
    static async renderPdfPrice(priceData, path) {

        const ERR_PREFIX = 'ViewSupplyPricesRender::renderPdfPrice';

        try {
            this.verifyPriceDataObject(priceData);
        } catch (err) {
            throw new Error(`${ERR_PREFIX} function parameters verification error. ${err.message}`);
        }

        let html = this.renderHtmlPriceForPdf(priceData);

        return this.renderPdf(html, path).catch(err => {
            let msg = ERR_PREFIX + ' ERROR: Unable to render pdf: ' + err.message;
            throw new Error(err);
        });

    }

    static verifyPriceDataObject(priceData) {

        let ERR_PREFIX = 'priceData object verification error:';
        let priceDataArraysProps = ['products', 'product_variants', 'product_pictures', 'title'];

        for (let attribName of priceDataArraysProps) {

            if (! (attribName in priceData) ) {
                let msg = `${ERR_PREFIX} Attribute ${attribName} not found. `;
                msg += `priceData must have next fields: ${JSON.stringify(priceDataArraysProps)}`;
                throw new Error(msg);
            } else if (attribName != 'title' && ! Array.isArray(priceData[attribName])) {
                let msg = `${ERR_PREFIX} priceData.${attribName} must be an Array`;
                throw new Error(msg);
            }

        }

    }

    /***
     *
     * @param {priceData} priceData
     * @returns {string} - returns rendered HTML for PDF
     */
    static renderHtmlPriceForPdf(priceData) {

        let htmlTemplateHeader = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                HTML {
                    zoom: 0.75;
                }
                BODY {
                    display: flex;
                    justify-content: center;
                    margin: 0;
                    padding: 0 0.5cm 0 0.5cm;
                }
                * {
                    font-size: 8pt;
                    box-sizing: border-box;
                }
                TABLE {
                    table-layout: fixed;
                    border-spacing: 0;
                    border-collapse: collapse;
                }
                TABLE TD {
                    border: 1px solid gray;
                    text-align: center;
                    vertical-align: center;
                    padding: 4px;
                    height: 0.5cm;
                    width: 2.07cm;
                }
                TD DIV {
                    border: none;
                    height: 6.5cm;
                    width: 4.89cm;
                    overflow: hidden;
                    box-sizing: border-box;
                    float: left;
                    padding-left: 3px;
                }
                .tr-header-1 {
                    height: 1.5cm;
                }
                .tr-header-2 {
                    height: 0.5cm;
                }
                .tr-left-align td, .td-left-align {
                    text-align: left;
                }
                .td-border-right {
                    border: none;
                    border-right: 1px solid gray;
                }
                .td-border-bottom {
                    border: none;
                    border-bottom: 1px solid gray;
                }
                .td-border-none {
                    border: none;
                }
                .td-accent {
                    background-color: rgb(255, 242, 204);
                }
                img {
                    width: 100%;
                }
                .td-margin {
                    border: none;
                    height: 1cm;
                }
                .break-before {
                    page-break-before: always;
                }
                .break-after {
                    page-break-after: always;
                }
            </style>
            <title>%CATEGORY_TITLE%</title>
        </head>
        <body> `;

        let htmlTemplateTableHeader =`
            <table class="%PAGE_BREAK%">
                <tr><td class="td-margin" colspan="9"></td></tr>
                <tr class="tr-header-1">
                    <td>SKU</td>
                    <td>Price CNY, exw Yiwu</td>
                    <td>Price USD, FOB Ningbo</td>
                    <td>Price EUR, DDP Warsaw</td>
                    <td>Price PLN, DDP Warsaw</td>
                    <td>Price USD, DDP NYC</td>
                    <td>Price RUB, DDP Moscow</td>
                    <td>Price UAH, DDP Odessa</td>
                    <td>Price HKD, DDP Hong Kong</td>
                    <td>MOQ</td>
                </tr>
                <tr class="tr-header-2">
                    <td>%SKU%</td>
                    <td>%price_cny_exw_yiwu% CNY</td>
                    <td>%price_usd_fob_ningbo% USD</td>
                    <td>%price_eur_ddp_warsaw% EUR</td>
                    <td>%price_pln_ddp_warsaw% PLN</td>
                    <td>%price_uds_ddp_nyc% USD</td>
                    <td>%price_rub_ddp_moscow% RUB</td>
                    <td>%price_uah_ddp_odessa% UAH</td>
                    <td>%price_hkd_ddp_hong_kong% HKD</td>
                    <td>%minimal_order_quantity%</td>
                </tr>`;

        let htmlTemplateTableImagesRow = `
                <tr>
                    <td colspan="10">
                        <div> %IMAGE_1% </div>
                        <div> %IMAGE_2% </div>
                        <div> %IMAGE_3% </div>
                        <div> %IMAGE_4% </div>
                    </td>
                </tr>`;

        let htmlTemplateTableSizesHeader = `
                <tr>
                    <td class="td-left-align" colspan="2">Size:</td>
                    <td></td>
                    <td></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-right"></td>
                </tr>`;

        let htmlTemplateTableSizeRow = `
                <tr class="tr-left-align">
                    <td colspan="2">%SIZE%</td>
                    <td class="td-accent">Order amount</td>
                    <td class="td-accent"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-right"></td>
                </tr>`;

        let htmlTemplateTableBottom = `
                <tr class="tr-left-align">
                    <td rowspan="2">Total:</td>
                    <td>Weight:</td>
                    <td>Volume:</td>
                    <td colspan="2">Material:</td>
                    <td colspan="2">Bestseller compare:</td>
                    <td class="td-border-none"></td>
                    <td class="td-border-none"></td>
                    <td class="td-border-right"></td>
                </tr>
                <tr class="tr-left-align">
                    <td>%WEIGHT% gr.</td>
                    <td>%VOLUME% cm3</td>
                    <td colspan="2">%MATERIAL%</td>
                    <td colspan="2">%BEST_SELLER_COMPARE%</td>
                    <td class="td-border-bottom"></td>
                    <td class="td-accent">Order amount total:</td>
                    <td class="td-accent"></td>
                </tr>
            </table>`;

        let htmlTemplateBottom =`
        </body>
        </html>       
        `;

        // ----------------------------------------------------------------------
        let rsProducts = priceData.products;
        let rsProductsVariants = priceData.product_variants;
        let rsProductsPictures = priceData.product_pictures;

        // Map incoming data to html template
        const IMAGES_PER_ROW_LIMIT=4;

        let htmlData = rsProducts.map(elProduct => {
            // Header
            let mappedObject = {
                SKU: elProduct.sku,
                MATERIAL: elProduct.material,
                WEIGHT: elProduct.weight,
                VOLUME: elProduct.volume,
                BEST_SELLER_COMPARE: elProduct.best_seller_compare,

                year_sales_count: elProduct.year_sales_count,
                minimal_order_quantity: elProduct.minimal_order_quantity,
                price_cny_exw_yiwu: elProduct.price_cny_exw_yiwu,
                price_usd_fob_ningbo: elProduct.price_usd_fob_ningbo,
                price_eur_ddp_warsaw: elProduct.price_eur_ddp_warsaw,
                price_pln_ddp_warsaw: elProduct.price_pln_ddp_warsaw,
                price_uds_ddp_nyc: elProduct.price_uds_ddp_nyc,
                price_rub_ddp_moscow: elProduct.price_rub_ddp_moscow,
                price_uah_ddp_odessa: elProduct.price_uah_ddp_odessa,
                price_hkd_ddp_hong_kong: elProduct.price_hkd_ddp_hong_kong
            };

            // --------------------------------------------------------
            // Sizes
            let sizes = rsProductsVariants.filter(el => el.product_id == elProduct.id).map(el => el.size);
            sizes = this.sortSizes(sizes);
            mappedObject.sizes = sizes.map(el => { return {'SIZE': el}; });

            // Pictures
            mappedObject.pictures = [];

            let pictures = rsProductsPictures.filter(el => el.product_id == elProduct.id)
                .slice(0, IMAGES_PER_ROW_LIMIT*2); // TOP 8 images = 2 rows

            // Building array of pictures rows, 4 pictures (IMAGES_PER_ROW_LIMIT) per row
            for (let startIndex=0; startIndex < pictures.length; startIndex+=IMAGES_PER_ROW_LIMIT) {

                let slice = pictures.slice(startIndex,
                    Math.min(startIndex+IMAGES_PER_ROW_LIMIT, pictures.length)
                );

                slice = slice.map((el, idx) => {
                    return {['IMAGE_'+(idx+1)]: `<img src="${el.url}" alt="">` };
                });

                while (slice.length < IMAGES_PER_ROW_LIMIT) {
                    slice.push( {['IMAGE_'+(slice.length+1)]: ''} );
                }

                mappedObject.pictures.push(slice);
            }

            return mappedObject;

        });

        // Render HTML
        let html = htmlTemplateHeader;
        let productsOnPageCounter = 0;
        let sizesOnPageCounter = 0;

        let dbgProductsCounter = 0;

        htmlData.forEach(elHtmlData => {

            //if (++dbgProductsCounter > 2) return;

            let outStr = htmlTemplateTableHeader;

            elHtmlData.pictures.forEach(elPicturesRow => {
                outStr += htmlTemplateTableImagesRow;

                elPicturesRow.forEach(elPicture => {
                    for (let [propName, propVal] of Object.entries(elPicture)) {
                        outStr = outStr.replace('%'+propName+`%`, propVal);
                    }
                });

            });

            // Sizes
            outStr += htmlTemplateTableSizesHeader;

            elHtmlData.sizes.forEach(elSize => {
                outStr += htmlTemplateTableSizeRow;

                for (let [propName, propVal] of Object.entries(elSize)) {
                    outStr = outStr.replace('%'+propName+`%`, propVal);
                }
            });

            // Bottom
            outStr += htmlTemplateTableBottom;

            for (let [propName, propVal] of Object.entries(elHtmlData)) {
                outStr = outStr.replace('%'+propName+`%`, propVal);
            }

            // Page break
            productsOnPageCounter++;
            sizesOnPageCounter += elHtmlData.sizes.length;

            //console.log(sizesOnPageCounter);

            if (elHtmlData.pictures.length > 1) {
                outStr = outStr.replace('%PAGE_BREAK%', 'break-before break-after');
                productsOnPageCounter = 0;
                sizesOnPageCounter = 0;
            }
            else if (productsOnPageCounter > 2 || (sizesOnPageCounter) > 10) {
                outStr = outStr.replace('%PAGE_BREAK%', 'break-before');
                productsOnPageCounter = 1;
                sizesOnPageCounter = elHtmlData.sizes.length;
            }
            else {
                outStr = outStr.replace('%PAGE_BREAK%', '');
            }

            html += outStr;

        });

        html += htmlTemplateBottom;

        return html;
    }

    static renderPdf(html, path) {

        return new Promise((resolve, reject) => {

            let options = { format: 'A4', timeout: (60 * 60 * 1000) };
            console.log('Rendering', path);

            pdf.create(html, options).toFile(path, function(err, res) {
                if (err) {
                    let msg = 'ViewSupplyPricesRender::renderPdf ERROR: ' + err.message;
                    reject(msg);
                }
                resolve(res);
            });

        });

    }

    static sortSizes(sizes) {

        const US_SIZE_ORDER  = ["XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "XXXXL"];

        let arrUsSizes = [];
        let arrOtherSizes = [];

        sizes.forEach(el => {

            if (US_SIZE_ORDER.includes(el))
                arrUsSizes.push(el);
            else
                arrOtherSizes.push(el);
        });

        arrOtherSizes = arrOtherSizes.sort((a,b) => {
            if (a > b)
                return 1;
            else if (a < b)
                return -1;
            else
                return 0;
        });

        arrUsSizes = arrUsSizes.sort((a,b) => {
            let orderIndexA = US_SIZE_ORDER.indexOf(a);
            let orderIndexB = US_SIZE_ORDER.indexOf(b);

            if (orderIndexA > orderIndexB)
                return 1;
            else if (orderIndexA < orderIndexB)
                return -1;
            else
                return 0;
        });

        return  arrOtherSizes.concat(arrUsSizes);

    }

}

function rus_to_latin ( str ) {

    const ru = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
        'е': 'e', 'ё': 'e', 'ж': 'j', 'з': 'z', 'и': 'i',
        'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh',
        'щ': 'shch', 'ы': 'y', 'э': 'e', 'ю': 'u', 'я': 'ya'
    }, n_str = [];

    str = str.replace(/[ъь]+/g, '').replace(/й/g, 'i');

    for ( var i = 0; i < str.length; ++i ) {
        n_str.push(
            ru[ str[i] ]
            || ru[ str[i].toLowerCase() ] == undefined && str[i]
            || ru[ str[i].toLowerCase() ].replace(/^(.)/, function ( match ) { return match.toUpperCase() })
        );
    }

    return n_str.join('');
}

// ViewSupplyPricesRender.renderPdf(  ViewSupplyPricesRender.renderHtmlPriceForPdf(1,2,3) );

//ViewSupplyPricesRender.renderPdfPrice({}, './Price.pdf');

//ViewSupplyPricesRender.makeHtml(1,2,3);

module.exports = ViewSupplyPricesRender;