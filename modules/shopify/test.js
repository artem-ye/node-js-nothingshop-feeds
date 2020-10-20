const ControllerShopify = require('./ControllerShopify');

/**
 *
 * @returns {Promise<void>}
 */
async function main() {

    await ControllerShopify.syncAllData().catch(err => {
        console.log('ERROR !!!', err.message);

    });


/*
    await ControllerShopify.test().catch(err => {
        console.log('ERROR !!!', err.message);

    });

 */

}

main().then(() => {

    //createError('main', 'foo', 'boo');
    //console.log('Done');
});
