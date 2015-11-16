var express = require('express');
var app = express();
var request = require('request');
var toMarkdown = require('to-markdown');
var async = require('async');
var freshdesk = require('./lib/freshdesk');
var github = require('./lib/github');

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var config_data = require('./lib/config');
//
// freshdeskHooks
//

//create a new github issue from a freshdesk ticket
app.post('/api/freshdeskHook/createIssue/:id', function(apiRequest, response) {

  var realCustomFieldName;
  var ticketDetails;
  var issueNumber;

  //see https://github.com/caolan/async#waterfall
  async.waterfall([
    freshdesk.getTicketFields, //takes null, returns realCustomFieldName
    function(fieldName, callback) {
      realCustomFieldName = fieldName;
      callback(null, apiRequest.params.id);
    },
    freshdesk.lookupTicket, //takes ticket id, returns body of JSON of ticket
    freshdesk.extractTicketDetails, //takes JSON response, returns ticketDetails object
    function(details, callback) {
      ticketDetails = details;
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
      callback(null, issueNumber, ticketDetails);
    },
    github.createComment //takes issue number and ticketDetails objtect, returns null
  ], function(error, result) {
    if(error) {
      response.status(500).send(error);
    }
    response.status(201).send("Issue created.");
  });
});

app.post('/api/freshdeskHook/createComment/:id', function(req, res) {
  var ticketDetails = {
    id: apiRequest.params.id
  };
  var issueDetails = {};

  //call FreshDesk API to retrieve ticket
  function lookupTicket() {
    request({
      url: ticketUrl(ticketDetails.id),
      method: 'GET',
      auth: {
        user: config_data.fd_api,
        pass: 'X'
      }
    }, extractTicketDetails);
  }

  //parse relevant details out of FD ticket.
  function extractTicketDetails(err, res, body) {
    if(err) {
      handleError("Error getting ticket details", err);
    } else {
      body = JSON.parse(body);
      var latest_note = body.helpdesk_ticket.notes[body.helpdesk_ticket.notes.length-1];
      ticketDetails.note = toMarkdown(latest_note.body_html);
      ticketDetails.note_user = latest_note.user_id;

      lookupUserDetails();
    }
  }

  //get name of user_id that submitted the latest note
  function lookupUserDetails() {
    request({
      url: userUrl(ticketDetails.note_user),
      method: 'GET',
      auth: {
        user: config_data.fd_api,
        pass: 'X'
      }
    }, extractUserDetails);
  }

  function extractUserDetails(err, res, body) {
    if(err) {
      handleError("Error retreiving user details", err);
    } else {
      body = JSON.parse(body);
      ticketDetails.note_user = body.user.name;

      //nextStep();
    }
  }

  function handleError(msg, err) {
    console.log(msg + ' ', err);
    response.status(500).send(msg + ' '+ err);
  }
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
