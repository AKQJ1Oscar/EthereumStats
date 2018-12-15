var express = require('express'),
  config = require('./config/config'),
  glob = require('glob'),

var models = glob.sync(config.root + '/app/models/*.js');

var app = express();

module.exports = require('./config/express')(app, config);

app.listen(config.port, function () {
  console.log('Express server listening on port ' + config.port);
});

