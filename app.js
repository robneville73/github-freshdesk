var express = require('express');
var app = express();
var request = require('request');
var async = require('async');
var freshdesk = require('./lib/freshdesk');
var github = require('./lib/github');
var bodyParser = require('body-parser');
var toMarkdown = require('to-markdown');

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var config_data = require('./lib/config');
//
// freshdeskHooks
//

//create a new github issue from a freshdesk ticket
app.post('/api/freshdeskHook/createIssue/:id', function(apiRequest, response) {

  var realCustomFieldName;
  var ticketDetails = {};
  var issueNumber;

  //see https://github.com/caolan/async#waterfall
  async.waterfall([
    freshdesk.getTicketFields, //takes null, returns realCustomFieldName
    function(fieldName, callback) {
      realCustomFieldName = fieldName;
      callback(null, apiRequest.params.id);
    },
    freshdesk.lookupTicket, //takes ticket id, returns body of JSON of ticket
    function(details, callback) {
      ticketDetails.subject = details.helpdesk_ticket.subject;
      ticketDetails.description = details.helpdesk_ticket.description;
      ticketDetails.ticketUrl = config_data.fd_url + '/' + details.helpdesk_ticket.display_id;
      callback(null);
    },
    github.authenticate, //takes null, returns null
    function(callback) {
      callback(null, ticketDetails);
    },
    github.createIssue, //takes ticketDetails object, returns issue number
    function(issueNum, callback){
      var data = {
        "helpdesk_ticket": {
          "custom_field": {}
        }
      };
      issueNumber = issueNum;
      data.helpdesk_ticket.custom_field[realCustomFieldName] = issueNum;
      callback(null, apiRequest.params.id, data);
    },
    freshdesk.updateTicket, //takes ticket id & updateObj, returns null
    github.authenticate, //takes null, returns null
    function(callback){
      callback(null, issueNumber, ticketDetails.ticketUrl);
    },
    github.createComment //takes issue number and comment, returns null
  ], function(error, result) {
    if(error) {
      response.status(500).send(error);
    }
    response.status(201).send("Issue created.");
  });
});

app.post('/api/freshdeskHook/createComment/:id', function(req, res) {
  var ticketDetails = {};
  var issueDetails = {};
  var realCustomFieldName;

  //see https://github.com/caolan/async#waterfall
  async.waterfall([
    freshdesk.getTicketFields,
    function(fieldName, callback) {
      realCustomFieldName = fieldName;
      callback(null);
    },
    function(callback) {
      callback(null, req.params.id);
    },
    freshdesk.lookupTicket, //takes ticket id, returns body of JSON of ticket
    function(details, callback) {
      var latest_note = details.helpdesk_ticket.notes[details.helpdesk_ticket.notes.length-1];
      ticketDetails.note = toMarkdown(latest_note.note.body_html);
      ticketDetails.note_user = latest_note.note.user_id;
      ticketDetails.githubissue = details.helpdesk_ticket.custom_field[realCustomFieldName];
      callback(null, ticketDetails.note_user);
    },
    freshdesk.lookupUserDetails, //takes FD user id, returns user object
    function(user_details, callback) {
      ticketDetails.last_note_username = user_details.name;
      ticketDetails.note = ticketDetails.last_note_username + ' added freshdesk note: ' + ticketDetails.note;
      callback(null);
    },
    github.authenticate,
    function(callback) {
      callback(null, ticketDetails.githubissue, ticketDetails.note);
    },
    github.createComment
  ], function(error, result) {
    if(error) {
      res.status(500).send(error);
    }
    res.status(201).send("Comment exported to github.");
  });

});

app.post('/api/freshdeskHook/linkIssue/:id', function(req, res) {
  res.json({
    message: "linkIssue",
    ticketId: req.params.id
  });
});

app.post('/api/freshdeskHook/resolveIssue/:id', function(req, res) {
  res.json({
    message: "resolveIssue",
    ticketId: req.params.id
  });
});

//
// github hooks
//
app.post('/api/githubHook/issueEvent', function(req, res) {
  res.send("got issueEvent");
});

app.post('/api/githubHook/issueCommentEvent', function(req, res) {
  res.send("got issueCommentEvent");
});

var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('freshdesk-gitub app listening at http://%s:%s', host, port);
});
