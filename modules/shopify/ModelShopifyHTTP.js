const https = require('https');

class ModelShopifyHTTP {

    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    // CONSTRUCTOR
    /////////////////////////////////////////////////////////////////////////////////////////////////////////

    constructor(key, pass, host, port= 443) {

        this.connOpts = {
            key: key,
            pass: pass,
            host: host,
            port: port
        };

        const URI_API_PREFIX = '/admin/api/2019-10/';

        // /admin/api/2020-01/products/#{product_id}/metafields.json

        this.apiPaths = {
            custom_collections: URI_API_PREFIX + "custom_collections.json?limit=250",
            custom_collections_delete: URI_API_PREFIX + "custom_collections/%OPTIONS%.json",
            custom_collections_post: URI_API_PREFIX + "custom_collections.json",

            custom_collections_metafields_get: URI_API_PREFIX + "custom_collections/%OPTIONS%/metafields.json",
            custom_collections_metafields_post: URI_API_PREFIX + "custom_collections/%OPTIONS%/metafields.json",

            products_get: URI_API_PREFIX + "products.json?limit=250",
            products_post: URI_API_PREFIX + 'products.json',
            products_delete: URI_API_PREFIX + 'products/%OPTIONS%.json',
            products_put: URI_API_PREFIX + 'products/%OPTIONS%.json',

            products_metafields_post: URI_API_PREFIX + 'products/%OPTIONS%/metafields.json',

            //products_variant_delete: URI_API_PREFIX + 'products/%OPTIONS%.json',
            products_variant_post: URI_API_PREFIX + 'products/%OPTIONS%/variants.json',
            products_variant_put: URI_API_PREFIX + 'variants/%OPTIONS%.json',

            collects_get: URI_API_PREFIX + 'collects.json?limit=250',
            //collects_get: '/admin/api/2020-04/collects.json?limit=249',
            collects_post: URI_API_PREFIX + 'collects.json',
            collects_delete: URI_API_PREFIX + 'collects/%OPTIONS%.json',

            inventory_location_get: URI_API_PREFIX + 'locations.json',
            inventory_levels_set_post: URI_API_PREFIX + 'inventory_levels/set.json',
        };

    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    // INTERFACE
    /////////////////////////////////////////////////////////////////////////////////////////////////////////

    /***
     *
     * @param uri
     * @param callback - call back function, must have @param response
     * @param successCode
     * @returns {Promise.<void>}
     */
    async httpGetPaginated(uri, callback, successCode=200) {

        let netPageUri = uri;

        do {

            let responseChunk = await this.httpGet(netPageUri, successCode);
            callback(responseChunk);
            netPageUri = responseChunk.nextPageURI;

        } while (netPageUri);

    }

    /***
     *
     * @param uri - request uri
     * @param successCode - success conde, default val is 200
     * @returns {Promise success: {statusCode: string, statusMessage: number, body: string, nextPageURI: string}}
     *
     * !!! nextPageURI - if response not full, this field will be filled with next page link
     */
    async httpGet(uri, uriOptions, successCode= 200) {

        let uriWithOpions = uri.replace('%OPTIONS%', uriOptions);
        let connOpts = this.buildConnOpts('GET', uriWithOpions);
        return this.httpFailOverRequest(connOpts, undefined, successCode);

    }

    async httpPost(uri, postData, uriOptions='', successCode=200) {

        let uriWithOpions = uri.replace('%OPTIONS%', uriOptions);
        let connOpts = this.buildConnOpts('POST', uriWithOpions);
        return this.httpFailOverRequest(connOpts, postData, successCode);
    }

    async httpPut(uri, postData, uriOptions='', successCode=200) {

        let uriWithOpions = uri.replace('%OPTIONS%', uriOptions);
        let connOpts = this.buildConnOpts('PUT', uriWithOpions);
        return this.httpFailOverRequest(connOpts, postData, successCode);

    }

    async httpDelete(uri, uriOptions='', successCode=200) {

        let uriWithOpions = uri.replace('%OPTIONS%', uriOptions);
        let connOpts = this.buildConnOpts('DELETE', uriWithOpions);
        return this.httpFailOverRequest(connOpts, undefined, successCode);

    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    // HTTP Request service methods
    /////////////////////////////////////////////////////////////////////////////////////////////////////////

    async httpFailOverRequest(connOpts, postData=undefined, successCode=200) {

        const HTTP_RETRY_CODE = [429];
        const MAX_RETRY_COUNT = 4;
        const RETRY_DELAY_MSEC = 4 * 1000; // mili seconds seconds

        /*
         The error, 429 too many requests, is raised when an app receives more API calls (put simply: messages, requests, notifications, etc.) than it allows.
         A single connection attempt, trigger, or action in a Workato recipe may require several API calls to function correctly.
         */

        for (let tryNum=1; tryNum <= MAX_RETRY_COUNT; tryNum++) {

            let response =  await this.httpRequest(connOpts, postData, successCode);

            if (HTTP_RETRY_CODE.includes(response.statusCode)) {

                let delay = RETRY_DELAY_MSEC * tryNum * tryNum;

                console.log('HTTP request: ' +connOpts.path+ '; Method: '+connOpts.method+
                    '; Status code: '+response.statusCode+'; Sleep '+delay+' m/sec ...');
                await this.sleep(delay);
            }
            else if (response.statusCode == successCode) {
                return response;
            }
            else {
                let errMsg = 'HTTP Error!!! Wrong status code: ' + response.statusCode
                    + '; Method: '+connOpts.method
                    +';  Message ' + response.statusMessage + '; URI ' + connOpts.path + ';';
                throw new Error(errMsg);
            }

        }

        let errMsg = 'ModelShopifyHTTP::httpFailOverRequest HTTP Error!!! Retry count exceed'
            + '; Method: ' +connOpts.method
            + '; URI ' + connOpts.path + ';';
        throw new Error(errMsg);

    }

    async httpRequest(connOpts, postData=undefined) {

        //console.log('HTTP request: ' + JSON.stringify(connOpts) + '; Data : ' + JSON.stringify(postData));

        return new Promise((resolve, reject) => {

            let request = https.request(connOpts, (res) => {

                let retValResponse = {
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    body: '',
                    nextPageURI: undefined
                };

                //console.log(res.headers.link);

                // Response pagination
                // Shopify splits large responses into pages
                // When its happen, response header contains 'link' field
                // which holds URL link to next page
                if (res.headers.link) {

                    // Parsing link str. It looks like this:
                    // <https://nothingshop-com.mysh ... 0aW9uIjoibmV4dCJ9>; rel="previous", <https://nothingshop-com.mysh ... 0aW9uIjoibmV4dCJ9>; rel="next"

                    let strNextLinkURL = res.headers.link
                        .split(',')
                        .find(el => el.split(';')[1].match(/"next"/));

                    if (strNextLinkURL) {
                        retValResponse.nextPageURI = strNextLinkURL
                            .split(';')[0]
                            .trim()
                            .slice(1, -1)
                            .replace(/^https?:\/\/[^\/]+/, '');

                    }

                }

                res.setEncoding('utf8');

                res.on('data', (chunk) => {
                    retValResponse.body += chunk;
                });

                res.on('end', () => {
                    resolve(retValResponse);
                });

            });

            // TODO Error must be more informative
            request.on('error', err => reject(err));

            if (postData) {
                request.write(JSON.stringify(postData));
            }

            request.end();

        });

    }

    buildConnOpts(method, uri) {

        return {
            auth: this.connOpts.key + ':' + this.connOpts.pass,
            host: this.connOpts.host,
            port: this.connOpts.port,
            headers: {
                'Content-Type': 'application/json'
            },
            method: method,
            path: uri
        };

    }

    async sleep(timeout) {

        return new Promise(resolve => {
            //console.log('Sleeping...');
            setTimeout(() => {
                //console.log('Resuming...');
                resolve();
            }, timeout);
        });

    }

}

module.exports = ModelShopifyHTTP;