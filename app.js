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
app.post('/api/freshdeskHook/createIssue/:id', function(req, res) {

  var realCustomFieldName;
  var ticketDetails = {};
  var issueNumber;

  //see https://github.com/caolan/async#waterfall
  async.waterfall([
    //
    // Grab FreshDesk ticket data
    //
    freshdesk.getTicketFields, //takes null, returns realCustomFieldName
    function(fieldName, callback) {
      realCustomFieldName = fieldName;
      callback(null, req.params.id);
    },
    freshdesk.lookupTicket, //takes ticket id, returns body of JSON of ticket
    function(details, callback) {
      if(details.helpdesk_ticket.status !== config_data.fd_customdevstatus) {
        callback(new Error("FreshDesk ticket not at status "+config_data.fd_customdevstatus));
        return;
      }
      if(details.helpdesk_ticket.custom_field[realCustomFieldName] !== null) {
        callback(new Error("FreshDesk ticket appears to already be linked to issue "+details.helpdesk_ticket.custom_field[realCustomFieldName]));
        return;
      }
      ticketDetails.subject = details.helpdesk_ticket.subject;
      ticketDetails.description = details.helpdesk_ticket.description;
      ticketDetails.ticketUrl = config_data.fd_url + '/' + details.helpdesk_ticket.display_id;
      callback(null);
    },

    //
    // Create new github issue from ticket details
    //
    github.authenticate, //takes null, returns null
    function(callback) {
      callback(null, ticketDetails);
    },
    github.createIssue, //takes ticketDetails object, returns issue number

    //
    // Update FreshDesk ticket with new issue number
    //
    function(issueNum, callback){
      var data = {
        "helpdesk_ticket": {
          "custom_field": {}
        }
      };
      issueNumber = issueNum;
      data.helpdesk_ticket.custom_field[realCustomFieldName] = issueNum;
      callback(null, req.params.id, data);
    },
    freshdesk.updateTicket, //takes ticket id & updateObj, returns null

    //
    // Create comment on GitHub issue with link to FreshDesk ticket
    //
    github.authenticate, //takes null, returns null
    function(callback){
      callback(null, issueNumber, ticketDetails.ticketUrl);
    },
    github.createComment //takes issue number and comment, returns null

    //
    // Handle result and errors
    //
  ], function(error, result) {
    if(error) {
      console.log("Problem creating issue", error);
      res.status(500).send(error.message);
    } else {
      res.status(201).send("Issue created.");
    }
  });
});

app.post('/api/freshdeskHook/createComment/:id', function(req, res) {
  var ticketDetails = {};
  var issueDetails = {};
  var realCustomFieldName;

  //TODO this thing has to be smart enough not to get into a loop of adding
  //comments when an API trigger causes a note to be written to freshdesk
  //see https://github.com/caolan/async#waterfall
  async.waterfall([
    //
    // Grab FreshDesk ticket details to get latest note
    //
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

    //
    // Lookup FreshDesk user details
    //
    freshdesk.lookupUserDetails, //takes FD user id, returns user object
    function(user_details, callback) {
      ticketDetails.last_note_username = user_details.name;
      ticketDetails.note = ticketDetails.last_note_username + ' added freshdesk note: ' + ticketDetails.note;
      callback(null);
    },

    //
    // Add new note to GitHub issue as a new comment on that issue
    //
    github.authenticate,
    function(callback) {
      callback(null, ticketDetails.githubissue, ticketDetails.note);
    },
    github.createComment

    //
    // Handle results and errors
    //
  ], function(error, result) {
    if(error) {
      console.log("Problem exporting comment to GitHub ", error);
      res.status(500).send(error.message);
    } else {
      res.status(201).send("Comment exported to github.");
    }
  });

});

app.post('/api/freshdeskHook/linkIssue/:id', function(req, res) {
  var ticketDetails = {};
  var issueDetails = {};
  var realCustomFieldName;

  //see https://github.com/caolan/async#waterfall
  async.waterfall([
    //
    // Grab FreshDesk ticket data
    //
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
      if(details.helpdesk_ticket.status !== config_data.fd_customdevstatus) {
        callback(new Error("FreshDesk ticket not at status "+config_data.fd_customdevstatus));
        return;
      }
      if(details.helpdesk_ticket.custom_field[realCustomFieldName] === null) {
        callback(new Error("FreshDesk ticket isn't linked to a GitHub issue. "+config_data.fd_customfield+" appears to be blank."));
        return;
      }
      ticketDetails.ticketUrl = config_data.fd_url + '/' + details.helpdesk_ticket.display_id;
      ticketDetails.githubissue = details.helpdesk_ticket.custom_field[realCustomFieldName];

      callback(null);
    },

    //
    // Update FreshDesk ticket to status 'Waiting on Development' custom status
    //
    function(callback) {
      var data = {
        "helpdesk_ticket": {
        }
      };
      data.helpdesk_ticket.status = config_data.fd_customdevstatus;
      callback(null, req.params.id, data);
    },
    freshdesk.updateTicket, //takes ticket id & updateObj, returns null

    //
    // Update GitHub issue with a comment linking to ticket and add linked label
    //
    github.authenticate, //takes null, returns null
    function(callback) {
      callback(null, ticketDetails.githubissue, ticketDetails.ticketUrl);
    },
    github.createComment, //takes issue number and comment, returns null
    function(callback) {
      callback(null, ticketDetails.githubissue, 'linked');
    },
    github.addIssueLabel

    //
    // Handle Results and Errors
    //
  ], function(error, result) {
    if(error) {
      console.log("error processing linkIssue ", error);
      res.status(500).send(error.message);
    } else {
      res.status(201).send("Freshdesk ticket now linked to github issue.");
    }
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
