var MongoClient = require('mongodb').MongoClient;
// Mongo uri
const MONGO_URI = "mongodb://127.0.0.1:27017";

exports.getWalletTreeFromMongo = function (res, wallet, nodes, levels, type, callback) {
  console.log("Function getWalletTreeFromMongo called.");

  MongoClient.connect(MONGO_URI, function(err, db) {
    console.log("Client opened.");
    if (err) {
      console.error("An error ocurred while connecting to the DDBB." + err);
      throw err;
    }

    var accounts = new Array();
    accounts.push(["source", "target", "weight", "ether", "hash"]);
    var accList = new Set();
    var accAlreadyProcessed = new Set();
    accList.add(wallet);
    var dbo = db.db('ethereumTracking');
    callback(accList, accAlreadyProcessed, res, type, accounts, nodes, dbo, db);
  });

}

exports.getTransactionsFromWallet = async function (remainingSize, dbo, query) {

    var cursor = dbo.collection('Transaction').find(query);
    //console.log("Got cursor");

    var result = new Array();

    var cursorCounter = 0;

    while (await cursor.hasNext()) {
      if (cursorCounter < remainingSize) {
        var doc = await cursor.next();
        result.push(doc);
        cursorCounter++;
      } else {
        break;
      }
    }

    //console.log("Closing cursor after " + cursorCounter + " iterations. Result length is " + result.length + " and remaining size is " + remainingSize);
    cursor.close();
    return result;
}

