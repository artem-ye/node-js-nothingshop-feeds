const update_db = require('../update_db');

let url = 'http://img.nothingshop.com/tmp/xml_products_supply_price_data.xml';

update_db.updateProductsSupplyPricesData(url).catch(err => {
    console.log('ERROR', err.message);
});