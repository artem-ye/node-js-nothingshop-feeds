

const update_db = require('../update_db');
const xmlUrl ='http://img.nothingshop.com/tmp/xml_inventory.xml';

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






