/*
async function translate(str) {

    return new Promise((resolve, reject) => {

        const translate = require('translation-google');

        translate(str, {to: 'en'}).then(res => {
            resolve(res.text);
        }).catch(err => {
            let msg = `Unable to translate. Module translation-google Error: ${err}`;
            reject(new Error(msg));
        });

    });

}

function memorizedTranslate() {

    let cache = {};

    return async function (str)  {

        cache[str] = cache[str] || translate(str).catch(err => {
            delete cache[str];
            console.log(cache);
            return Promise.reject(err);
        });

        return cache[str];
    }

}

let fnTranslate = memorizedTranslate();

fnTranslate('Hi %^').then(res => console.log('1 Result are', res));

fnTranslate('err').then(res => console.log('2 Result are', res)).catch(e => {
    console.log('TRANSLATION Error', e.message);
});

fnTranslate('Hi').then(res => console.log('3 Result are', res));

fnTranslate('Hi').then(res => console.log('4 Result are', res));

//console.log(res);



//fnTranslate('Hello').then(res => console.log('2 Res are', res));


 */

// https://eastus.api.cognitive.microsoft.com/
// 5eaf3c0aa9294909a8be2b3e05981fc9
// 32c960107fa4424cb0065f751be8d9ac

let ControllerSupplyPrices = require('./ControllerSupplyPrices');
ControllerSupplyPrices.updateAllPrices().catch(err => {
    console.error(err.message);
});



