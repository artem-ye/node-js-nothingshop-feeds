const ControllerSupplyPrices = require('./modules/supply_prices/ControllerSupplyPrices');
const ControllerShopify = require('./modules/shopify/ControllerShopify');

async function updatePdfSupplyPrices() {

    return new Promise((resolve, reject) => {

        ControllerSupplyPrices.updateAllPrices().catch(err => {
            reject(err);
        }).then(_ => resolve());

    });

}

async function updateMersadaTradeShopifyCMS() {

    return new Promise((resolve, reject) => {

        ControllerShopify.syncAllData().catch(err => {
            reject(err);
        }).then(res => resolve(res));

    });

}

async function updateAll() {

    updatePdfSupplyPrices().catch(err => {
        console.error(err.message);
    });

    updateMersadaTradeShopifyCMS().catch(err => {
        console.error(err.message);
    });
}

module.exports.updateAll = updateAll;

/*
updatePdfSupplyPrices().catch(err => {
    console.error(err.message);
});

 */