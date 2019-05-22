var Web3 = require('web3');
var net = require('net');
var MongoClient = require('mongodb').MongoClient;
var hash = require('string-hash'); // number between 0 and 4294967295 (2^32 - 1), inclusive

const MONGO_URI = "mongodb://localhost:27016";
// [PROD] Using the IPC provider in node.js

const GETH_IPC_PATH = '/ethereum/red-principal/geth.ipc';
var web3 = new Web3();
web3.setProvider(GETH_IPC_PATH, net);

// --- Populate Mongo With Transactions: {hash, sender, receiver, amount, blockNumber}---
module.exports.txTrackingPopulation = function() {
	getLastBlockNumber();
}

function getLastBlockNumber() {
	var lastBlock = web3.eth.getBlockNumber().then(function(lastBlockNumber) {
		getStartBlockNumber(lastBlockNumber)
	});
}

function getStartBlockNumber(lastBlockNumber) {
	console.log("Getting the startBlockNumber...");
	MongoClient.connect(MONGO_URI, function(err, db) {
		var dbo = db.db("ethereumTracking");
		console.log("Client opened.");
		if (err) {
			console.error("An error ocurred while connecting to the DDBB." + err);
			return;
		}
		dbo.collection('ControlInformation').find().sort({
			dateLogged: -1
		}).limit(1).toArray(
		function(err, result) {
			if (err) {
				throw err;
			}
			if (result[0] == undefined || result[0].lastBlock == undefined || result[0].lastBlock == null) {
				startBlockNumber = 0;
			} else {
				startBlockNumber = result[0].lastBlock;
			}
			db.close();
			removePreviousUncompletedBatch(startBlockNumber, lastBlockNumber);
		});
	});
}

function removePreviousUncompletedBatch(startBlockNumber, lastBlockNumber) {
	console.log("Getting the startBlockNumber...");
	MongoClient.connect(MONGO_URI, function(err, db) {
		var dbo = db.db("ethereumTracking");
		console.log("Client opened.");
		if (err) {
			console.error("An error ocurred while connecting to the DDBB." + err);
			return;
		}
		console.log("START BLOCK NUMBER is " + startBlockNumber);
		dbo.collection('Transaction').deleteMany({
			blockNumber: {
				$gte: startBlockNumber
			}
		}, function(err, result) {
			if (err) {
				throw err;
			}
			console.log("The result from the delete operation is " + result + "\n");
			console.log("Deleted transactions from block " + startBlockNumber + " onwards before populating.\n");
			console.log("Starting the population with START:" + startBlockNumber + " and LAST:" + lastBlockNumber);
			db.close();
			iterateTransactions(startBlockNumber, lastBlockNumber);
		});
	});
}

function iterateTransactions(startBlockNumber, lastBlockNumber) {
	console.log("Opening mongo client...");
	MongoClient.connect(MONGO_URI, function(err, db) {
		var dbo = db.db("ethereumTracking");
		console.log("Client opened.");
		if (err) {
			console.error("An error ocurred while connecting to the DDBB." + err);
			return;
		}
		//Customize
		var start = startBlockNumber;
		var end = lastBlockNumber;
		var batchSize = 5000;
		var iterationCounter = 0;
		console.log("Before iterating...")
		txTrackingPopulation(dbo, batchSize, start, end, iterationCounter, db);
	});
}

function txTrackingPopulation(dbo, batchSize, start, end, iterationCounter, db) {
	console.log("Populate Transactions called...");
	var counter = 0;
	var stop;
	var startBlock = start + iterationCounter;
	if ((batchSize) < (end - startBlock)) {
		stop = startBlock + batchSize;
	} else {
		stop = end;
	}
	console.log("Stop is " + stop);
	for (var i = startBlock; i < stop; i++) {
		web3.eth.getBlock(i, true, function(error, result) {
			if (error != null) {
				console.error("An error ocurred while getting the block. " + error);
				throw error;
			}
			console.log("Processing the block: " + result.number);
			if (result != null) {
				var txList = new Array();
				if (result.transactions.length > 0) {
					var blockLength = result.transactions.length;
					var txCounter = 0;
					result.transactions.forEach(function(e) {
						var tx = {};
						console.log("The tx is: " + JSON.stringify(e));
						tx.hash = e.hash;
						tx.sender = e.from;
						tx.receiver = e.to;
						tx.amount = (e.value) / 1000000000000000000;
						tx.blockNumber = result.number;
						dbo.collection('Transaction').insert({
							_id: tx.hash,
							sender: tx.sender,
							receiver: tx.receiver,
							amount: tx.amount,
							blockNumber: tx.blockNumber
						}, function(err, result) {
							if (err != null) {
								console.error("The error output after adding the document to the database is " + err);
								throw err;
							}
							txCounter++;
							if (blockLength == txCounter) {
								counter++;
							}
							if (counter == (stop - startBlock)) {
								iterationCounter += counter;
								console.log("Iteration counter is " + iterationCounter);
								if (iterationCounter == (end - start)) {
									console.log("Closing client.");
									dbo.collection('ControlInformation').insertOne({
										dateLogged: new Date(new Date().toISOString()),
										lastBlock: stop+1
									}, {
										upsert: true
									}, function(error, result) {
										console.log("Control information saved for block " + (stop+1));
										db.close();
										return;
									});
								} else {
									console.log("Calling Populate Transactions again..." + "\n");
									dbo.collection('ControlInformation').insertOne({
										dateLogged: new Date(new Date().toISOString()),
										lastBlock: stop+1
									}, {
										upsert: true
									}, function(error, result) {
										console.log("Control information saved for block " + (stop+1));
										txTrackingPopulation(dbo, batchSize, start, end, iterationCounter, db);
									});
								}
							}
						});

					});
				} else {
					console.log("There are not transactions in this block.");
					counter++;
					//console.log("Counter is " + counter);
					if (counter == (stop - startBlock)) {
						iterationCounter += counter;
						console.log("Iteration counter is " + iterationCounter);
						if (iterationCounter == (end - start)) {
							dbo.collection('ControlInformation').insertOne({
										dateLogged: new Date(new Date().toISOString()),
										lastBlock: stop+1
									}, {
										upsert: true
									}, function(error, result) {
										console.log("Control information saved for block " + (stop+1));
										db.close();
										return;
									});
						} else {
							console.log("Calling Populate Transactions again..." + "\n");
							dbo.collection('ControlInformation').insertOne({
								dateLogged: new Date(new Date().toISOString()),
								lastBlock: stop+1
							}, {
								upsert: true
							}, function(error, result) {
								txTrackingPopulation(dbo, batchSize, start, end, iterationCounter, db);
							});
						}
					}
				}
			}
		});
	}
}

// ------------------ Populate Mongo With Blocks: {number, transactions (hash, sender, receiver, amount), miner}
module.exports.toMongo = function() {
	populateDatabase();
}

function populateDatabase() {
	console.log("Opening mongo client...");
	MongoClient.connect("mongodb://localhost:27017", function(err, db) {
		var dbo = db.db("ethereumTracking");
		console.log("Client opened.");
		if (err) {
			console.error("An error ocurred while connecting to the DDBB." + err);
			return;
		}
		//Customize
		var start = 5300000;
		var end = 6000000;
		var batchSize = 2000;
		var iterationCounter = 0;
		console.log("Before iterating...")
		populateInBatches(dbo, batchSize, start, end, iterationCounter, db);
	});
}

function populateInBatches(dbo, batchSize, start, end, iterationCounter, db) {
	console.log("Populate in batches called...");
	var counter = 0;
	var stop;
	var startBlock = start + iterationCounter;
	if ((batchSize) < (end - startBlock)) {
		stop = startBlock + batchSize;
	} else {
		stop = end;
	}
	console.log("Stop is " + stop);
	for (var i = startBlock; i < stop; i++) {
		web3.eth.getBlock(i, true, function(error, result) {
			if (error != null) {
				console.error("An error ocurred while getting the block. " + error);
				throw error;
			}
			console.log("Processing the block: " + result.number);
			if (result != null) {
				var txList = new Array();
				if (result.transactions.length > 0) {
					result.transactions.forEach(function(e) {
						var tx = {};
						console.log("The tx is: " + JSON.stringify(e));
						tx.hash = e.hash;
						tx.sender = e.from;
						tx.receiver = e.to;
						tx.amount = (e.value) / 1000000000000000000;
						txList.push(tx);
					});
				} else {
					console.log("There are not transactions in this block.");
				}
				var toInsert = {}
				toInsert.number = result.number;
				toInsert.transactions = txList;
				toInsert.miner = result.miner;
				console.log("The doc to insert is: " + JSON.stringify(toInsert));
				dbo.collection('Block').updateOne({
					number: toInsert.number
				}, {
					$set: toInsert
				}, {
					upsert: true
				}, function(err, result) {
					if (err != null) {
						console.error("The error output after adding the document to the database is " + err);
						throw err;
					}
					counter++;
					if (counter == (stop - startBlock)) {
						iterationCounter += counter;
						console.log("Iteration counter is " + iterationCounter);
						if (iterationCounter == (end - start)) {
							console.log("Closing client.");
							db.close();
							return;
						} else {
							console.log("Calling PopulateInBatches again..." + "\n");
							populateInBatches(dbo, batchSize, start, end, iterationCounter, db);
						}
					}
				});
			}
		});
	}
}

// ---------------- Populate MongoDB with Wallets: {hash, etherTotal, senders, receievers} -----------------------
module.exports.walletsTracking = function() {
	trackWallets();
}

function trackWallets() {
	console.log("Opening mongo client...");
	MongoClient.connect("mongodb://localhost:27017", function(err, db) {
		var dbo = db.db("ethereumTracking");
		console.log("Client opened.");
		if (err) {
			console.error("An error ocurred while connecting to the DDBB." + err);
			return;
		}
		//Customize
		var start = 5000000;
		var end = 5010000;
		var batchSize = 10000;
		// Blocks total counter
		var iterationCounter = 0;
		console.log("Before iterating...")
		populateInBatchesForWalletsTracking(dbo, batchSize, start, end, iterationCounter, db);
	});
}

function populateInBatchesForWalletsTracking(dbo, batchSize, start, end, iterationCounter, db) {
	console.log("Populate in batches for wallets tracking called...");
	//Blocks counter on this batch
	var counter = 0;
	var stop;
	var startBlock = start + iterationCounter;
	if ((batchSize) < (end - startBlock)) {
		stop = startBlock + batchSize;
	} else {
		stop = end;
	}
	/*
	--- Data structure ---
	Wallet:
	 - id
	 - amountSent
	 - amountReceived
	 - receivers: object
			- txHash
			- blockNumber
			- receiver
			- amount
	 - senders: object
			- txHash
			- blockNumber
			- sender
			- amount
			*/
	var wallets = [];
	var wallets_index = new Set();
	console.log("Stop is " + stop);

	for (var j = startBlock; j < stop; j++) {
		web3.eth.getBlock(j, true, function(error, result) {
			if (error != null) {
				console.error("An error ocurred while getting the block. " + error);
				throw error;
			}
			console.log("Processing the block: " + result.number);
			if (result != null) {
				if (result.transactions.length > 0) {
					result.transactions.forEach(function(e) {
						currentFrom = {};
						currentTo = {};
						// for the other ones, we need to check whether that wallet is already in the the wallets array
						var indexFrom = -1;
						var indexTo = -1;
						//console.log("From is " + e.from + " and to is " + e.to + " and txHash is " + e.hash);
						var fromHash = hash(e.from);
						var toHash = "";
						if (e.to != null) {
							// if it is the creation of a contract it can be null
							var toHash = hash(e.to);
						}
						if (wallets[fromHash] != null) {
							if (wallets[fromHash].id == e.from) {
								indexFrom = fromHash;
							}
						}
						if (wallets[toHash] != null) {
							if (wallets[toHash].id == e.to) {
								indexTo = toHash;
							}
						}
						if (indexFrom != -1) {
							//console.log("Already in wallets");
							currentFrom = wallets[indexFrom];
							currentFrom.etherSent += ((e.value) / 1000000000000000000);
							currentFrom.receivers.push({
								txHash: e.hash,
								blockNumber: result.number,
								receiver: e.to,
								amount: ((e.value) / 1000000000000000000)
							});
							wallets[indexFrom] = currentFrom;
						} else {
							//console.log("Not already in wallets");
							currentFrom.id = e.from;
							currentFrom.etherSent = ((e.value) / 1000000000000000000);
							currentFrom.etherReceived = 0;
							currentFrom.receivers = [{
								txHash: e.hash,
								blockNumber: result.number,
								receiver: e.to,
								amount: ((e.value) / 1000000000000000000)
							}];
							currentFrom.senders = [];
							wallets[fromHash] = currentFrom;
							wallets_index.add(fromHash);
						}
						// information to update the senders field
						if (indexTo != -1) {
							//console.log("Already in wallets");
							currentTo = wallets[indexTo];
							currentTo.etherReceived += ((e.value) / 1000000000000000000);
							currentTo.senders.push({
								txHash: e.hash,
								blockNumber: result.number,
								sender: e.from,
								amount: ((e.value) / 1000000000000000000)
							});
							wallets[indexTo] = currentTo;
						} else {
							//console.log("Not already in wallets");
							currentTo.id = e.to;
							currentTo.etherSent = 0;
							currentTo.etherReceived = ((e.value) / 1000000000000000000);
							currentTo.receivers = [];
							currentTo.senders = [{
								txHash: e.hash,
								blockNumber: result.number,
								sender: e.from,
								amount: ((e.value) / 1000000000000000000)
							}];
							wallets[toHash] = currentTo;
							wallets_index.add(toHash);
						}
					});
					counter++;
					if (counter % 100 == 0) {
						console.log("Counter is " + counter);
					}
					if (counter == (stop - startBlock)) {
						var wallets_index_array = Array.from(wallets_index);
						var wallets_index_length = wallets_index_array.length;
						// Wallets counter on this batch
						var counter_iter = 0;
						console.log("Updating MongoDB... Wallets length is " + wallets_index_length + ". Date is " + new Date());
						updateWalletInMongo(dbo, batchSize, start, end, iterationCounter, db, counter, wallets_index_array, counter_iter, wallets, wallets_index_length);
					}
				} else {
					console.log("There are not transactions in this block.");
				}
			}
		});
	}
}

function updateWalletInMongo(dbo, batchSize, start, end, iterationCounter, db, counter, wallets_index_array, counter_iter, wallets, wallets_index_length) {
	// If the wallet is already stored, get its current value, to update the ether sent and received and its receivers and senders arrays
	var i_i = wallets_index_array[0];
	//var wallet_id = wallets[i_i].id;
	//console.log("Wallets id at index " + i_i + " is " + wallets[i_i].id + ". Wallets size is " + wallets.length);
	dbo.collection('Wallet').updateOne({
		id: wallets[i_i].id
	}, {
		$set: {
			id: wallets[i_i].id
		},
		$push: {
			receivers: {
				$each: wallets[i_i].receivers
			},
			senders: {
				$each: wallets[i_i].senders
			}
		},
		$inc: {
			etherSent: wallets[i_i].etherSent,
			etherReceived: wallets[i_i].etherReceived
		}
	}, {
		upsert: true
	}, function(err, result) {
		if (err != null) {
			console.error("The error output after updating the document in the database is " + err);
			throw err;
		}
		console.log("Doing stuff in MongoDB... Date is " + new Date());
		counter_iter++;
		console.log("Counter_iter is " + counter_iter + " and wallets length " + wallets_index_length);
		if (counter_iter == wallets_index_length) {
			iterationCounter += counter;
			console.log("Iteration counter is " + iterationCounter + " and end-start is " + (end - start));
			console.log("Counter is " + counter);
			if (iterationCounter == (end - start)) {
				console.log("Closing client.");
				db.close();
				return;
			} else {
				console.log("Calling populateInBatchesForWalletsTracking again..." + "\n");
				populateInBatchesForWalletsTracking(dbo, batchSize, start, end, iterationCounter, db);
			}
		} else {
			wallets_index_array.splice(0, 1);
			updateWalletInMongo(dbo, batchSize, start, end, iterationCounter, db, counter, wallets_index_array, counter_iter, wallets, wallets_index_length)
		}
	});
}
