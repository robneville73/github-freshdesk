var nconf = require('nconf');

nconf.file({
  file: 'config.json'
});

var config_data = {};
config_data.repo = nconf.get('repo');
config_data.githubUser = nconf.get('githubUser');
config_data.githubPassword = nconf.get('githubPassword');
config_data.fd_api = nconf.get('fd_api');
config_data.fd_url = nconf.get('fd_url');
config_data.fd_customfield = nconf.get('fd_customfield');
config_data.fd_customdevstatus = nconf.get('fd_customdevstatus');

module.exports = config_data;
