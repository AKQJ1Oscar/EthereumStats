var Web3 = require('web3');
var R = require("r-script");
var csv = require("array-to-csv");
var fs = require('fs');
var net = require('net');
var exec = require('child_process').exec;
var hash = require('string-hash'); // number between 0 and 4294967295 (2^32 - 1), inclusive
const parse = require('csv-parse/lib/sync');
const uuidv1 = require('uuid/v1');
var model = require('../models/model.js');

// Batch size
var n = 2000;

// Whether to write to CSV
var CSVWrite = true;

// --- PROD
// Using the IPC provider in node.js
const GETH_IPC_PATH = '/ethereum/red-principal/geth.ipc';
var web3 = new Web3();
web3.setProvider(GETH_IPC_PATH, net);

var express = require('express'),
router = express.Router();
module.exports = function(app) {
	app.use('/', router);
};

/*
----- Resolving API calls -----
*/
/*
router.get('/', function(req, res) {
	renderIndex(res);
})

router.get('/index.html', function(req, res) {
	renderIndex(res);
})

router.get('/tx', function(req, res) {
	res.render('tx', {
		title: "aaa"
	})
})

router.get('/wallets', function(req, res) {
	res.render('formIndex', {
		title: "aaa"
	})
})
*/
router.get('/statistics', function(req, res) {
	getStatistics(res);
})
/*
// Calls the function to get a random tx
router.get('/getTxRandom', function(req, res) {
	var blockNumberParam = req.query.num;
	getRandomTx(blockNumberParam, res, false);
});

// Finds the graph for this tx
router.get('/getTxTree', function(req, res) {
	var nodes = 250;
	var nOfBlocksToSearch = 10000;
	var txList = [];
	var type = req.query.type;

	if (req.query.nodeNum != "" && req.query.nodeNum != null && req.query.nodeNum != undefined) {
		nodes = req.query.nodeNum;
	}
	if (req.query.bsNumber != "" && req.query.bsNumber != null && req.query.bsNumber != undefined) {
		nOfBlocksToSearch = parseInt(req.query.bsNumber);
	}

	//We will use this until populating Mongo with the whole chain
	var currentNumberOfBlocks = 300000;
	var chosenBlockNumber = Math.random() * (currentNumberOfBlocks);
	var chosenBlock = Math.round(chosenBlockNumber);
	chosenBlock = 5000000 + chosenBlock;

	var tx = req.query.tx;
	resGlobal = res;
	if (tx == "" || tx == null || tx == undefined) {
		tx = getRandomTx(chosenBlock, res, true, nodes, nOfBlocksToSearch, txList, type);
	} else {
		txList.push(tx);
		//console.log("The nodeNumber is: " + nodes + ".\n The nOfBlocksToSearch is: " + nOfBlocksToSearch + ".\n The TX to search is (custom): " + tx + ".\n");
		getTxInfo(tx, res, nodes, nOfBlocksToSearch, txList, type);
	}
});
*/
// Get the graph for a wallet
router.get('/wallets/walletTree', function(req, res) {
	console.log("Function get /wallets/walletTree called.");
	// We add 1 because the first element of the accounts array (later on) will be the description of each field
	var nodes = 251;
	var levels = "";
	var txList = [];
	var type = req.query.type;

	var currentNumberOfBlocks = 400000;
	var chosenBlockNumber = Math.random() * (currentNumberOfBlocks);
	var chosenBlock = Math.round(chosenBlockNumber);
	chosenBlock = 5000000 + chosenBlock;

	if (req.query.nodeNum != "" && req.query.nodeNum != null && req.query.nodeNum != undefined) {
		// We add 1 because the first element of the accounts array (later on) will be the description of each field
		nodes = parseInt(req.query.nodeNum) + 1;
	}

	var wallet = req.query.wallet;
	if (wallet == "" || wallet == null || wallet == undefined) {
		getRandomWallet(chosenBlock, res, nodes, levels, type);
	} else {
		model.getWalletTreeFromMongo(res, wallet, nodes, levels, type, getReceiversForWalletInMongo);
	}
});

/*
----- R scripts -----
*/

// Called when req.query.type is normal
function RCallNormal(res, accounts) {
	console.log("Function RCallNormal called.");
	var out = R("/home/ether/EthereumTracking/TFM/R/betweenness.R")
	.data()
	.callSync();
	var uuid = generateJSON(res, accounts, "normal");
	if (uuid == null) {
		console.log("Uuid got was null");
		return;
	}
	console.log("saving graph...");
        res.end(JSON.stringify(uuid[1]), removeJSON(uuid[0]))
}

// Called when req.query.type is betweenness
function RCallBetween(res, accounts) {
	console.log("Function RCallBetween called.");
	var out = R("/home/ether/EthereumTracking/TFM/R/betweenness.R")
	.data()
	.callSync();
	var uuid = generateJSON(res, accounts, "betweenness");
	if (uuid == null) {
		console.log("Uuid got was null");
		return;
	}
	console.log("saving graph...");
	res.end(JSON.stringify(uuid[1]), removeJSON(uuid[0]))
}

// Called when req.query.type is closeness
function RCallCloseness(res, accounts) {
	console.log("Function RCallCloseness called.");
	var out = R("/home/ether/EthereumTracking/TFM/R/closeness.R")
	.data()
	.callSync();
	var uuid = generateJSON(res, accounts, "closeness");
	if (uuid == null) {
		console.log("Uuid got was null");
		return;
	}
	console.log("saving graph...");
        res.end(JSON.stringify(uuid[1]), removeJSON(uuid[0]))
}

// Called when req.query.type is page rank
function RCallPageRank(res, accounts) {
	console.log("Function RCallPageRank called.");
	var out = R("/home/ether/EthereumTracking/TFM/R/pagerank.R")
	.data()
	.callSync();
	var uuid = generateJSON(res, accounts, "pageRank");
	if (uuid == null) {
		console.log("Uuid got was null");
		return;
	}
	console.log("saving graph...");
        res.end(JSON.stringify(uuid[1]), removeJSON(uuid[0]))
}

/*
----- Application logic -----
*/

// --- Get from MongoDB ---
//Choose a random wallet from a stored block
function getRandomWallet(chosenBlock, res, nodes, levels, type) {
	console.log("Function getRandomWallet called.");
	var respuesta = "";
	var txLength = 0;

	web3.eth.getBlock(chosenBlock, true, function(error, result) {
		if (error != null) {
			console.error("An error ocurred while getting the block. " + error);
			throw error;
		}
		if (result != null) {
			if (result.transactions.length > 0) {
				txLength = result.transactions.length;
				var chosenTxNumber = Math.random() * (txLength - 1);
				var chosenTx = Math.round(chosenTxNumber);
				var wallet = result.transactions[chosenTx].from;
				console.log("First wallet is " + wallet);
				model.getWalletTreeFromMongo(res, wallet, nodes, levels, type, getReceiversForWalletInMongo);
			}
		}
	});
};

async function getReceiversForWalletInMongo(accList, accAlreadyProcessed, res, type, accounts, nodes, dbo, db) {
	console.log("Function getReceiversForWalletInMongo called.");
	if (accList.size < 1) {
		//console.log("From is \n" + accForm);
		//console.log("To is \n" + accTo);
		console.log("Nodes limit achieved. Printing and exiting");
		printTransGraph(res, type, accounts);
		return;
	} else {
		// Get the next one
		var wallet = accList.values().next().value;
		var query = {
			"sender": wallet
		};
		console.log("Next wallet from set is " + wallet + ".\n");

		// Get the remainin size. We will stop iterating through the cursor if this number is reached
		var remainingSize = nodes - accounts.length;
		var result = await model.getTransactionsFromWallet(remainingSize, dbo, query);
		if (result.length > 0) {
			// Receivers size for this wallet
			var size = result.length;
			//console.log(size + " receivers for this wallet");
			//console.log("Size is " + size + " for wallet" + wallet);
			// Number of remaining nodes to add

			// Max nodes number reached in this iteration
			if (size >= remainingSize) {
				size = remainingSize;
				//console.log("Size and remaining size are equal " + size + " " + remainingSize);
				//console.log("Size after updating to the remaining size is : " + size);
				for (var i = 0; i < size; i++) {
					//console.log(result.rows[0].receivers[i]);
					var receiver = result[i]["receiver"];
					var amount = result[i]["amount"];
					var hash = result[i]["_id"];
					//console.log("RECEIVER is " + receiver + " AMOUNT is " + amount + " HASH is " + hash);
					if (wallet != null && wallet != "" && wallet != undefined &&
						receiver != null && receiver != "" && receiver != undefined &&
						hash != null && hash != "" && hash != undefined) {
						//console.log("adding wallet\n");
					accounts.push([wallet, receiver, 1, amount, hash]);
				}
			}
			console.log("Nodes limit achieved. Printing and exiting");
				//console.log("Accounts is " + accounts);
				printTransGraph(res, type, accounts);
				return db.close();
			} else {
				for (var i = 0; i < size; i++) {
					var item = result[i];
					//console.log("Item is " + JSON.stringify(item));
					//console.log("Receiver is " + item["receiver"]);
					var receiver = result[i]["receiver"];
					var amount = result[i]["amount"];
					var hash = result[i]["_id"];
					//console.log("RECEIVER is " + receiver + " AMOUNT is " + amount + " HASH is " + hash);
					if (wallet != null && wallet != "" && wallet != undefined &&
						receiver != null && receiver != "" && receiver != undefined &&
						hash != null && hash != "" && hash != undefined) {
						//console.log("adding wallet\n");
						accounts.push([wallet, receiver, 1, amount, hash]);
						if (accAlreadyProcessed.has(receiver) == false) {
							accList.add(receiver);
						}
					}
				}
				accList.delete(wallet);
				accAlreadyProcessed.add(wallet);
				getReceiversForWalletInMongo(accList, accAlreadyProcessed, res, type, accounts, nodes, dbo, db);
			}
		} else {
			console.log("[WARN] Wallet " + wallet + " does not have any receivers.");
			accList.delete(wallet);
			getReceiversForWalletInMongo(accList, accAlreadyProcessed, res, type, accounts, nodes, dbo, db);
		}
	}
}

/*
----- Auxiliary funtions
*/

//Render index
/*async function renderIndex(res) {
	console.log("Function renderIndex called.");
	web3.eth.getBlockNumber().then(function(block) {
		web3.eth.getBlock(block, true, function(error, result) {
			if (error) {
				throw err;
			}
			var lastBlock = new Array();
			for (var i = 0; i<result.transactions.length; i++) {
				var data = {};
				data.hash = result.transactions[i].hash;
				data.sender = result.transactions[i].from;
				data.receiver = result.transactions[i].to;
				if (result.transactions[i].value != null) {
					data.amount = (result.transactions[i].value / 1000000000000000000).toFixed(3).toString();  
				} else {
					data.amount = result.transactions[i].value;
				}
				lastBlock.push(data);
			}
			res.render('index', {
				title: "aaa",
				bNumber: block,
				miner: result.miner,
				difficulty: (result.difficulty / 1000000000000).toFixed(3).toString(),
				txNumber: result.transactions.length,
				lastBlock : lastBlock
			});
		});
	});
}*/

function groupPairsOfNodes(accounts) {
	console.log("Function groupPairsOfNodes called.");
	var groupedAccounts = new Array();
	var setAccounts = new Set();
	groupedAccounts.push(["source", "target", "weight"]);
	for (var i = 1; i < accounts.length; i++) {
		var counter = 1;
		if (setAccounts.has(accounts[i][0] + accounts[i][1])) {
			continue;
		}
		if (i == (accounts.length - 1)) {
			groupedAccounts.push([accounts[i][0], accounts[i][1], counter]);
		}
		for (var j = i + 1; j < accounts.length; j++) {
			if (accounts[i][0] == accounts[j][0] && accounts[i][1] == accounts[j][1]) {
				counter++;
			}
			if (j == (accounts.length - 1)) {
				if (!setAccounts.has(accounts[i][0] + accounts[i][1])) {
					groupedAccounts.push([accounts[i][0], accounts[i][1], counter]);
					setAccounts.add(accounts[i][0] + accounts[i][1]);
				}
			}
		}
	}
	return groupedAccounts;
}

function groupPairsOfNodesForVisualization(accounts) {
	console.log("Function groupPairsOfNodesForVisualization called.");
	var groupedAccounts = new Array();
	var setAccounts = new Set();
	groupedAccounts.push(["source", "target", "weight", "ether", "hash"]);
	for (var i = 1; i < accounts.length; i++) {
		var counter = 1;
		var ether = accounts[i][3];
		if (setAccounts.has(accounts[i][0] + accounts[i][1])) {
			continue;
		}
		if (i == (accounts.length - 1)) {
			groupedAccounts.push([accounts[i][0], accounts[i][1], counter, ether, accounts[i][4]]);
		}
		for (var j = i + 1; j < accounts.length; j++) {
			if (accounts[i][0] == accounts[j][0] && accounts[i][1] == accounts[j][1]) {
				counter++;
				//console.log("This tx ether is " + accounts[j][3]);
				ether += accounts[j][3];
				//console.log("New ether is " + ether);
			}
			if (j == (accounts.length - 1)) {
				if (!setAccounts.has(accounts[i][0] + accounts[i][1])) {
					// We always add the txHash, but if counter!=1, the next function (generateJson) won't use that in the view
					groupedAccounts.push([accounts[i][0], accounts[i][1], counter, ether, accounts[i][4]]);
					setAccounts.add(accounts[i][0] + accounts[i][1]);
				}
			}
		}
	}
	return groupedAccounts;
}

// This function writes the nodes and links information into a JSON file, so that the view is able to represent the graph
function generateJSON(res, accounts, type) {
	console.log("Function generateJSON called.");
	// Generate a uuid to name the json file where the result will be stored. This prevents from different users overwritting each other's JSON.
	var uuid = uuidv1().toString() + ".json";
	uuid = "a"+uuid;
	console.log("Uuid is " + uuid);
	// Generating the links part
	var links = new Array();
	for (var i = 1; i < accounts.length; i++) {
		var txInformationToDisplay = "";
		if (accounts[i][2] == 1) {
			//txInformationToDisplay = "hash:"+accounts[i][4];
			txInformationToDisplay = "hash:" + accounts[i][4] + "; ether:" + accounts[i][3];
		} else {
			//txInformationToDisplay = "txNumber:"+accounts[i][2];
			txInformationToDisplay = "number:" + accounts[i][2] + "; ether:" + accounts[i][3];
		}
		links.push({
			source: accounts[i][0],
			target: accounts[i][1],
			tx: txInformationToDisplay
		});
	}
	// Generating the nodes part
	var nodes = new Array();
	var content = null;
	try {
		content = fs.readFileSync('/home/ether/EthereumTracking/TFM/R/result.csv', 'utf8');
	} catch (error) {
		console.log("Error reading result.csv file.");
		// TODO render an error message
		return null;
	}
	// thanks to https://csv.js.org/parse/api/#sync-api
	var records = parse(content, {
		columns: true,
		skip_empty_lines: true
	});
	if (type == "normal") {
		for (var i = 0; i < records.length; i++) {
			nodes.push({
				name: records[i][Object.keys(records[i])[0]].substring(0, 7),
				id: records[i][Object.keys(records[i])[0]]
			});
		}
	} else {
		// Get fill maximum value to configure the color range
		var maxColor = 0;
		for (var i = 0; i < records.length; i++) {
			var resultInt = parseFloat(records[i].result);
			if (resultInt > maxColor) {
				maxColor = resultInt;
			}
		}
		// We will set a different color gradient depending on the graph's type
		var colorHexRange = 240;
		for (var i = 0; i < records.length; i++) {
			var mappedValue = 255 - colorHexRange;
			if (maxColor == 0) {
				mappedValue = 255 - colorHexRange;
			} else {
				mappedValue = Math.floor(((records[i].result)/maxColor)*colorHexRange) + mappedValue;
			}
			var fillValue = mappedValue.toString(16);
			var fillValueAux = Math.floor(mappedValue*mappedValue/383).toString(16);
			if (fillValueAux.length < 2) {
				fillValueAux = "0" + fillValueAux;
			}
			var fillString = "";
			if (type == "betweenness") {
				// blue - betweenness
				fillString = "#" + fillValue + "0080";
			} else if (type == "closeness") {
				// green - closeness
				fillString = "#00" + fillValue + fillValueAux;
			} else if (type == "pageRank") {
				// red - pageRank
				fillString = "#" + fillValue + fillValueAux + "00";
			}
			nodes.push({
				name: records[i][Object.keys(records[i])[0]].substring(0, 7),
				id: records[i][Object.keys(records[i])[0]],
				fill: fillString
			});
		}
	}
	// Writing to JSON file
	var jsonOutput = {
		"nodes": nodes,
		"links": links
	};
	try {
		fs.writeFileSync('/home/ether/EthereumTracking/TFM/EthereumStats/public/wallets/' + uuid, JSON.stringify(jsonOutput), 'utf8');
		return [uuid, jsonOutput];
	} catch (error) {
		console.log("Error while writing result.json");
		return null;
	}
	console.log("JSON created.");
}

// After a few seconds (we give the view some time to render), remove the file
function removeJSON(uuid) {
	setTimeout(function() {
		fs.unlink('/home/ether/EthereumTracking/TFM/EthereumStats/public/wallets/' + uuid, (err) => {
			if (err) throw err;
			console.log(uuid + ' was deleted');
		});
	}, 7 * 1000);
}

function getStatistics(res) {
	model.getStatisticsData(res, printStats);
}

function printStats(res, result) {
	var bNumber;
	var miner;
	var difficulty = 3;
	var txNumber;
	web3.eth.getBlockNumber().then(function(block) {
		web3.eth.getBlock(block, true, function(error, result) {
			if (error) {
				throw err;
			}
			var lastBlock = new Array();
			for (var i = 0; i<result.transactions.length; i++) {
				var data = {};
				data.hash = result.transactions[i].hash;
				data.sender = result.transactions[i].from;
				data.receiver = result.transactions[i].to;
				if (result.transactions[i].value != null) {
					data.amount = (result.transactions[i].value / 1000000000000000000).toFixed(3).toString();  
				} else {
					data.amount = result.transactions[i].value;
				}
				lastBlock.push(data);
			}
			bNumber = block;
			miner = result.miner;
			difficulty = (result.difficulty / 1000000000000).toFixed(3).toString();
			txNumber = result.transactions.length;
			console.log(bNumber);
			console.log(miner);
			console.log(difficulty);
			console.log(txNumber);
			statistics();
		});
	});
	senders = result[0];
	receivers = result[1];
	txSenders = senders.tx;
	txReceivers = receivers.tx;
	etherSenders = senders["ether"];
	etherReceivers = receivers["ether"];
	console.log("txSenders: " + txSenders);
	console.log("txReceivers: " + txReceivers);
	console.log("etherSenders: " + etherSenders);
	console.log("etherReceivers: " + etherReceivers);
	function statistics() {
		res.render('statistics', { txSenders: txSenders, txReceivers: txReceivers, etherSenders: etherSenders, etherReceivers: etherReceivers, bNumber: bNumber, miner: miner, difficulty: difficulty, txNumber: txNumber });
	}
}

// Save accounts to CSV and call the R script.
function printTransGraph(res, type, accounts) {
	console.log("Function printTransGraph called.");
	accountsVisualization = groupPairsOfNodesForVisualization(accounts);
	accounts = groupPairsOfNodes(accounts);
	accountsToCSV = csv(accounts);
	if (CSVWrite) {
		try {
			fs.writeFileSync('/home/ether/EthereumTracking/TFM/R/CSVfrom.csv', accountsToCSV, 'utf8');
		} catch (error) {
			console.log("Error while writing CSVfrom.csv file.");
			//TODO RENDER ERROR CODE
			return;
		}
		if (type == "normal") {
			//console.log("Calling RCallNormal()");
			RCallNormal(res, accountsVisualization);
		} else if (type == "betweenness") {
			RCallBetween(res, accountsVisualization);
			//console.log("Calling RCallBetween()");
		} else if (type == "closeness") {
			RCallCloseness(res, accountsVisualization);
		} else if (type == "page rank") {
			RCallPageRank(res, accountsVisualization);
		} else {
			console.log("Wrong input type.");
		}
	}
}

// --- Start of sequential and real-time tracking ---
// Get a random tx given a block number
/*function getRandomTx(blockNumber, res, ui, nodes, nOfBlocksToSearch, txList, type) {
	var respuesta = "";
	var txlength = 0;
	web3.eth.getBlock(blockNumber, false, function(error, result) {
		if (!error && result != null) {
			if (result.transactions.length == 0) {
				console.log('There are no transactions in this block.');
				if (ui == true) {
					res.render('index', {
						title: "aaa",
						notFound: "The transaction was not found, try with another one."
					});
				}
				return;
			}
			//console.log('Listado de transacciones del bloque ' + blockNumber + ':\n' + result.transactions);
			txlength = result.transactions.length;
			//console.log("The transactions number in this block is: " + txlength);
			var chosenTxNumber = Math.random() * (txlength - 1);
			var chosenTx = Math.round(chosenTxNumber);
			//console.log('The transaction to track is: ' + result.transactions[chosenTx]);
			if (ui == false) {
				res.send(result.transactions[chosenTx]);
			} else {
				txList.push(result.transactions[chosenTx]);
				//console.log("The nodeNumber is: " + nodes + ".\n The nOfBlocksToSearch is: " + nOfBlocksToSearch + ".\n The TX to search is (random): " + result.transactions[chosenTx] + ".\n");
				getTxInfo(result.transactions[chosenTx], res, nodes, nOfBlocksToSearch, txList, type);
			}
		} else {
			if (result == null) {
				console.log('The block was not created.');
				if (ui == true) {
					res.render('index', {
						title: "aaa",
						notFound: "The transaction was not found, try with another one."
					});
				}
				return;
			}
			console.log('An error occured: ', error);
		};
	});
};

// Finds the block number, sender an receiver wallets for the tx
function getTxInfo(tx, res, nodes, nOfBlocksToSearch, txList, type) {
	console.log("The transaction to track is: " + tx + ".");
	var accToSearch = new Set();
	var startBlockNumber;
	var startBlockNumberRep;
	var bNumber;
	var accounts = new Array();
	accounts.push(["source", "target", "weight"]);
	web3.eth.getTransaction(tx, function(error, result) {
		if (!error) {
			//Variables globales wallets (array con las wallets) y txs (array con las transacciones), esta última se ha añadido ya antes de llamar a esta función
			accToSearch.add(result.from);
			accToSearch.add(result.to);
			accounts.push([result.from, result.to, 1]);
			startBlockNumber = result.blockNumber;
			startBlockNumberRep = startBlockNumber;
			bNumber = result.blockNumber;
			//console.log("Size of accToSearch at the beginning " + accToSearch.size);
			getNBlocks(res, nodes, nOfBlocksToSearch, txList, type, accounts, accToSearch, startBlockNumberRep, bNumber, startBlockNumber, processBlocks);
		} else {
			console.error("The transaction " + tx + " was not found. The error is: " + error);
			res.render('index', {
				title: "aaa",
				notFound: "The transaction " + tx + " was not found, try with another one."
			});
		}
	});

};

// Returns an ordered array with the given block and the next N-1
function getNBlocks(res, nodes, nOfBlocksToSearch, txList, type, accounts, accToSearch, startBlockNumberRep, bNumber, startBlockNumber, callback) {
	blocks = new Array(n);
	nOfBlocks = 0;
	var start = startBlockNumberRep;
	//var a = startBlockNumber+nOfBlocksToSearch;
	//console.log("MAX NUMBER IS: " + a);
	//var number = start;
	for (var i = start; i < (start + n); i++) {
		web3.eth.getBlock(i, true, function(error, result) {
			//Comprobamos que no estamos al final de la cadena
			if ((result != null) && (result.number < (startBlockNumber + nOfBlocksToSearch))) {
				nOfBlocks++;
				blocks[(result.number) - start] = result;
				//console.log("The downloaded block number is " + result.number + " | " + parseInt(startBlockNumber + nOfBlocksToSearch) + " and nOfBlocks is " + nOfBlocks);
				if (nOfBlocks == n || ((nOfBlocks == nOfBlocksToSearch) && nOfBlocksToSearch < n) || (result.number == (startBlockNumber + nOfBlocksToSearch - 1) && (nOfBlocks == n))) {
					if (blocks[n - 1] != null) {
						//console.log("The last block number in getNBlocks is " + blocks[n - 1].number);
					} else {
						//console.log("The last block number in getNBlocks is undefined. Batch size may be bigger than number of iterations.");
					}
					startBlockNumberRep = startBlockNumberRep + nOfBlocks;
					callback(blocks, res, nodes, nOfBlocksToSearch, txList, type, accounts, accToSearch, startBlockNumberRep, bNumber, startBlockNumber, start, callback);
				};
			};
		});
	};
};

// Returns an array with the related transactions
function processBlocks(blocks, res, nodes, nOfBlocksToSearch, txList, type, accounts, accToSearch, startBlockNumberRep, bNumber, startBlockNumber, start, callback) {
	var nOfBlocks = [];
	for (var i = 0; i < blocks.length; i++) {
		if (blocks[i] != null && blocks[i].transactions != null) {
			//console.log("Searching for transactions in block " + blocks[i].number);
			bNumber = blocks[i].number;
			blocks[i].transactions.forEach(function(e) {
				if (accToSearch.size > 0) {
					if (accToSearch.has(e.sender) && (accToSearch.size < (nodes))) {
						//txList[e.hash] = [e.from, e.to, e.blockNumber];
						txList.push(e.hash);
						//console.log("COMPARANDO []" + [e.to] + " con " + e.to);
						accToSearch.add([e.receiver]);
						accounts.push([e.sender, e.receiver, 1, ((e.value) / 1000000000000000000), e.hash]);
						//console.log("AccFrom is: " + accFrom.toString() + "\n and AccTo is: " + accTo.toString());
					};
				};
			});
			if (!((accToSearch.size < (nodes)) && ((bNumber + 1) < ((startBlockNumber + nOfBlocksToSearch))))) {
				printTrans(true, res, txList, type, accounts, accToSearch);
				//console.log("The number of blocks looked into is " + (bNumber - startBlockNumber + 1));
				//console.log("The bNumber at the end is: " + bNumber);
				return;
			} else if (i == (blocks.length - 1)) {
				if ((accToSearch.size < (nodes)) && ((bNumber + 1) < ((startBlockNumber + nOfBlocksToSearch)))) {
				 // console.log("The blockNumber is " + bNumber);
				 getNBlocks(res, nodes, nOfBlocksToSearch, txList, type, accounts, accToSearch, startBlockNumberRep, bNumber, startBlockNumber, processBlocks);
			 }
		 }
	 };
 };
};

// Save accounts to CSV and call the R script.
function printTrans(pintar, res, txList, type, accounts, accToSearch) {
	if (pintar) {
		//console.log("END. The transactions list is:\n"+Object.values(txList)+"\n"+ "And the group of related accounts:\n"+accToSearch.toString());
		//console.log("There are " + txList.length + " transactions and " + accToSearch.size + " accounts");
		accountsVisualization = groupPairsOfNodesForVisualization(accounts);
		accounts = groupPairsOfNodes(accounts);
		accountsToCSV = csv(accounts);
		try {
			fs.writeFileSync('/home/ether/EthereumTracking/TFM/R/CSVfrom.csv', accountsToCSV, 'utf8');
		} catch (error) {
			console.log("Error while writing CSVfrom.csv file.");
			return;
		}
		if (type == "normal") {
			//console.log("Calling RCallNormal()");
			RCallNormal(res, accountsVisualization);
		} else if (type == "betweenness") {
			RCallBetween(res, accountsVisualization);
			//console.log("Calling RCallBetween()");
		} else {
			console.log("Wrong input type.");
		}
	}
}
*/
// --- End of sequential and real-time tracking ---

/*
----- Function below was created just to test a few things. Only useful for debugging
*/
// Test to store an array as .csv
// Desired outputd: source,target,weight
//  0x0...0,0x0...1,1
//  0x1...0,0x1...1,1
/*router.get('/CSVTest', function(req, res) {
	a = new Array();
	a.push(["source", "target", "weight"]);
	a.push(['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000001', 1, 1, 'primera']);
	a.push(['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000002', 1, 2, 'segunda']);
	a.push(['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000001', 1, 3, 'tercera']);
	a.push(['0x1111111111111111111111111111111111111110', '0x1111111111111111111111111111111111111111', 1, 4, 'cuarta']);
	a.push(['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000001', 1, 5, 'quinta']);
	b = groupPairsOfNodesForVisualization(a);
	a = groupPairsOfNodes(a);
	//console.log(a);
	aToCSV = csv(a);
	var fs = require('fs');
	fs.writeFile('/home/ether/EthereumTracking/TFM/CSV/CSV.csv', aToCSV, 'utf8', function(err) {
		if (err) {
			console.error('Some error occured - file either not saved or corrupted file saved.', err);
		} else {
			console.log('It\'s saved!');
		}
	});
});
*/
