const express = require('express');
const app = express();
const port = 3000;

const update_db = require('./update_db');
const update_feeds = require('./update_feeds');


app.get('/', (request, response) => {
    response.send('Hello from Express!');
});

app.get('/update-feeds', (request, response) => {

    console.log("Updating all feeds...");
    response.send("Updating all feeds...");

    update_feeds().then(
        () => {
            console.log("All feed updated");
        },
        err => {
            console.log("Error " + err.message);
        }
    );

});

app.get('/update-db', (request, response) => {

    console.log("Updating db");

    let xmlUrl = request.query.xmlurl;

    if (!xmlUrl) {
        response.status(400);
        let msg = "GET: Parameter xmlurl not found";
        response.send(msg);
        console.log(msg);
        return false;
    }

    response.send("Updating db");

    update_db.UpdateAllData(xmlUrl).then(
        () => {
            console.log("DB updated");
            console.log("Updating feeds!!!");
            update_feeds().then(
                ()=> console.log("All feed updated"),
                (err) => console.log("Error " + err.message)
            );
        },
        err => {
            console.log("Error " + err.message);
        }
    );

});

app.get('/update-db-inventory', (request, response) => {

    console.log("Updating db inventory data");

    let xmlUrl = request.query.xmlurl;

    if (!xmlUrl) {
        response.status(400);
        let msg = "GET: Parameter xmlurl not found";
        response.send(msg);
        console.log(msg);
        return false;
    }

    response.send("Updating db inventory data");

    update_db.UpdateInventoryData(xmlUrl).then(
        () => {
            console.log("DB updated");

            console.log("Updating feeds!!!");
            update_feeds().then(
                ()=> console.log("All feed updated "),
                (err) => console.log("Error " + err.message)
            );

        },
        err => {
            console.log("Error " + err.message);
        }
    );

});


app.get('/update-supply-prices', (request, response) => {

    console.log("Updating supply prices data");

    let xmlUrl = request.query.xmlurl;

    if (!xmlUrl) {
        response.status(400);
        let msg = "GET: Parameter xmlurl not found";
        response.send(msg);
        console.log(msg);
        return false;
    }

    response.send("Updating supply prices data started");

    update_db.updateProductsSupplyPricesData(xmlUrl).then(
        () => {
            console.log("Supply prices updated");
            console.log("Updating pdf prices, Shpify CMS");

            const update_mersada_trade_supply_data = require('./update_mersada_trade_supply_data');
            update_mersada_trade_supply_data.updateAll().catch(err => {
                console.error(err.message);
            });

        },
        err => {
            console.log("Error " + err.message);
        }
    );

});

app.listen(port, (err) => {
    if (err) {
        return console.log('something bad happened', err)
    }
    console.log(`server is listening on ${port}`)
});