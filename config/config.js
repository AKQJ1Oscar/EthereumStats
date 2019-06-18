var path = require('path'),
		rootPath = path.normalize(__dirname + '/..'),
		env = process.env.NODE_ENV || 'development';

var config = {
	development: {
		root: rootPath,
		app: {
			name: 'ethereumstats'
		},
		port: process.env.PORT || 80,
		db: 'mongodb://localhost:27017/'
	},

	test: {
		root: rootPath,
		app: {
			name: 'ethereumstats'
		},
		port: process.env.PORT || 80,
		db: 'mongodb://localhost/ethereumstats-test'
	},

	production: {
		root: rootPath,
		app: {
			name: 'ethereumstats'
		},
		port: process.env.PORT || 80,
		db: 'mongodb://localhost/ethereumstats-production'
	}
};

module.exports = config[env];
