var express = require('express'),
  config = require('./config/config'),
  glob = require('glob'),
  mongoose = require('mongoose');

//mongoose.connect(config.db, { auth: { authdb: 'Tracether' }, user: 'ether-arkham-trace', pass: 'jxzCYvqzQz7cb3x' });
/*mongoose.connect(config.db, {
	user: 'mongoArkhamAdmin',
	pass: '5\cL5E=Qi9tn3]7O'
});*/
mongoose.connect("mongodb://localhost:27016/ethereumTracking")
var db = mongoose.connection;
db.on('error', function () {
  throw new Error('Unable to connect to database at ' + config.db);
});

var models = glob.sync(config.root + '/app/models/*.js');
models.forEach(function (model) {
  require(model);
});
var app = express();

module.exports = require('./config/express')(app, config);

app.listen(config.port, function () {
  console.log('Express server listening on port ' + config.port);
});
