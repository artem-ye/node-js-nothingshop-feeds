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
*/

const request = require('request');
const uuidv4 = require('uuid/v4');

async function translate(text) {

    const TRANSLATOR_TEXT_SUBSCRIPTION_KEY = '5eaf3c0aa9294909a8be2b3e05981fc9';
    const TRANSLATOR_TEXT_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/';
    const TRANSLATOR_TEXT_REGION = 'eastus';

    const subscriptionKey = TRANSLATOR_TEXT_SUBSCRIPTION_KEY;
    const endpoint = TRANSLATOR_TEXT_ENDPOINT;
    const subscriptionRegion = TRANSLATOR_TEXT_REGION;

    let options = {
        method: 'POST',
        baseUrl: endpoint,
        url: 'translate',
        qs: {
            'api-version': '3.0',
            'to': ['en']
        },
        headers: {
            'Ocp-Apim-Subscription-Key': subscriptionKey,
            'Ocp-Apim-Subscription-Region': subscriptionRegion,
            'Content-type': 'application/json',
            'X-ClientTraceId': uuidv4().toString()
        },
        body: [{
            'text': text
        }],
        json: true,
    };

    //console.log('TRANSLATING');

    return new Promise((resolve, reject) => {

        try {

            request(options, function(err, res, body){

                try {
                    resolve( body[0].translations[0].text );
                } catch (e) {
                    let msg = `BING translate error. Wrong response body format: ${body}`;
                    reject(new Error(msg));
                }

            });

        } catch (e) {
            let msg = `BING translate HTTP request error:  ${e.message}`;
            reject(new Error(msg));
        }

    });

}

function memorizedTranslate() {

    let cache = {};

    return async function (str)  {

        cache[str] = cache[str] || translate(str).catch(err => {
            delete cache[str];
            return Promise.reject(err);
        });

        return cache[str];
    }

}

//module.exports = translation;
module.exports = memorizedTranslate();