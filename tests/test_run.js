const update_feeds = require('../update_feeds');
const update_db = require('../update_db');

const request = require('request');

//update_db();

async function httpGet(url) {

    return new Promise((resolve, reject) => {

        request.get(url, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                resolve(body);
            } else {
                let msg = "Download err. URL: " + url + "CODE " + response.statusCode;

                if (error)
                    msg += error.message;

                reject(new Error(msg));
            }
        });

    });
}



async function main() {

    console.log('Start');

    const url = 'http://img.nothingshop.com/tmp/xml_inventory.xml12';
    let xmlData = '';


    try {
        xmlData = await httpGet(url);
    }
    catch (err) {
        console.log("ERR!!! " + err.message);
        return false;
    }




    console.log(xmlData.substr(0, 50));
    console.log(xmlData.substr(-10));



    console.log('End');

}



/*
url = 'http://img.nothingshop.com/tmp/xml_inventory.xml';

var request = require('request');
request.get(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {


        //var csv = body;
        // Continue with your processing here.

        console.log(body);

    }
});
*/

/*
main().catch(e => {
    console.log(e);
});
*/

update_feeds(); 
