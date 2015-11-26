var express = require('express');
var app = express();
var request = require('request');
var async = require('async');
var freshdesk = require('./lib/freshdesk');
var github = require('./lib/github');
var bodyParser = require('body-parser');
var toMarkdown = require('to-markdown');

//app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var config_data = require('./lib/config');
//
// freshdeskHooks
//

var fd_status = {
  OPEN: 2,
  RESOLVED: 4
};

fd_status.TODEV = config_data.fd_customdevstatus;

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
      if(details.helpdesk_ticket.status !== fd_status.TODEV) {
        callback(new Error("FreshDesk ticket not at status "+fd_status.TODEV));
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
      //make sure that this isn't a comment that came from GitHub so we don't
      //get caught in a loop of adding comments
      if (ticketDetails.note.indexOf("@note") >= 0) {
        callback(new Error("Automatic note should not be sent back..."));
        return;
      }
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

app.put('/api/freshdeskHook/linkIssue/:id', function(req, res) {
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
      if(details.helpdesk_ticket.status !== fd_status.TODEV) {
        callback(new Error("FreshDesk ticket not at status "+fd_status.TODEV));
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
      res.status(200).send("Freshdesk ticket now linked to github issue.");
    }
  });
});

app.put('/api/freshdeskHook/resolveIssue/:id', function(req, res) {
  var realCustomFieldName;
  var ticketDetails = {};

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
      //do some sanity checking
      if(details.helpdesk_ticket.status !== fd_status.RESOLVED) {
        callback(new Error("FreshDesk ticket not at Resolved status."));
        return;
      }
      if(details.helpdesk_ticket.custom_field[realCustomFieldName] === null) {
        callback(new Error("FreshDesk ticket isn't linked to a GitHub issue. "+config_data.fd_customfield+" appears to be blank."));
        return;
      }

      ticketDetails.githubissue = details.helpdesk_ticket.custom_field[realCustomFieldName];

      callback(null);
    },

    //
    // Check GitHub issue to make sure it exists, is linked and is opened.
    //
    github.authenticate, //takes null, returns null
    function(callback) {
      callback(null, ticketDetails.githubissue);
    },
    github.getIssue, //will bomb if not present.
    function(githubissue, callback) {
      if(githubissue.state !== 'open') {
        callback(new Error("Github issue "+ticketDetails.githubissue+" doesn't appear to be open anyways."));
        return;
      }
      linkedLabel = githubissue.labels.map(function(element){
        if(element.hasOwnProperty('name') && element.name === 'linked') {
          return element.name;
        }
      });
      if(linkedLabel.length <= 0) {
        callback(new Error("Github issue doesn't appear to be linked to anything."));
        return;
      }
      callback(null);
    },

    // add comment to GitHub issue that the FreshDesk ticket was closed
    function(callback) {
      callback(null, ticketDetails.githubissue, "The help desk ticket that this issue was linked to has been manually closed.");
    },
    github.createComment, //takes issue number and comment, returns null

    //unlink GitHub issue.
    function(callback) {
      callback(null, ticketDetails.githubissue, 'linked');
    },
    github.removeIssueLabel,


    //
    // Update FreshDesk ticket to remove custom field value
    //
    function(callback) {
      var data = {
        "helpdesk_ticket": {
          "custom_field": {}
        }
      };
      data.helpdesk_ticket.custom_field[realCustomFieldName] = null;
      callback(null, req.params.id, data);
    },
    freshdesk.updateTicket, //takes ticket id & updateObj, returns null

    //
    // Handle Results and Errors
    //
  ], function(error, result) {
    if(error) {
      console.log("error processing resolveIssue ", error);
      res.status(500).send(error.message);
    } else {
      res.status(200).send("Freshdesk ticket now resolved.");
    }
  });
});

app.put('/api/freshdeskHook/reopenTicket/:id', function(req, res) {
  var realCustomFieldName;
  var ticketDetails = {};

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
      //do some sanity checking
      if(details.helpdesk_ticket.status !== 4) { //4 == Resolved
        callback(new Error("FreshDesk ticket not at Resolved status."));
        return;
      }
      if(details.helpdesk_ticket.custom_field[realCustomFieldName] === null) {
        callback(new Error("FreshDesk ticket isn't linked to a GitHub issue. "+config_data.fd_customfield+" appears to be blank."));
        return;
      }

      ticketDetails.githubissue = details.helpdesk_ticket.custom_field[realCustomFieldName];

      callback(null, ticketDetails.githubissue);
    },

    //
    // Check FreshDesk ticket to make sure it exists and it's closed.
    //
    github.getIssue, //will bomb if not present.
    function(githubissue, callback) {
      if(githubissue.state !== 'open') {
        callback(new Error("Github issue "+ticketDetails.githubissue+" doesn't appear to be open."));
        return;
      }
      callback(null);
    },

    //
    // Add note to FreshDesk ticket that development has resolved the issue
    //
    function(callback) {
      callback(null, req.params.id, "Development has re-opened the development issue linked to this ticket.");
    },
    freshdesk.addNote,

    //
    // Update FreshDesk ticket to status 'Waiting on Development' custom status
    //
    function(callback) {
      var data = {
        "helpdesk_ticket": {
        }
      };
      data.helpdesk_ticket.status = 2; //2 == Open
      callback(null, req.params.id, data);
    },
    freshdesk.updateTicket, //takes ticket id & updateObj, returns null

    //
    // Handle Results and Errors
    //
  ], function(error, result) {
    if(error) {
      console.log("error processing reopenTicket ", error);
      res.status(500).send(error.message);
    } else {
      res.status(201).send("Freshdesk ticket now re-opened.");
    }
  });
});

//
// github hooks
//
app.put('/api/githubHook/issueEvent', function(req, res) {
  //labeled
  //unlabeled
  //closed
  res.send("got issueEvent");
});

app.post('/api/githubHook/issueCommentEvent', function(req, res) {
  //see https://developer.github.com/v3/activity/events/types/#issuecommentevent
  var comment;
  var eventPayload = req.body; //bodyParser should've decoded into JSON already
  var updateCount = 0;
  if (eventPayload.action === "created") {
    comment = eventPayload.comment.body;
    if (comment.indexOf('@note') >= 0) {
      //this issue comment should be copied to FreshDesk
      async.waterfall([
        function(callback) {
          callback(null, eventPayload.issue.number);
        },
        github.getLinkedTickets,
        function(fd_issues, callback) {
          //add note to each linked ticket in parallel with async.each
          async.each(fd_issues, function(item, eachCallback) {
            freshdesk.addNote(item, comment, function(err) {
              if (err) {
                eachCallback(err);
              } else {
                updateCount = updateCount + 1;
                eachCallback();
              }
            });
          }, function(err, results) {
            if (err) {
              console.log("Error in async.each trying to add notes to FD");
              eachCallback(new Error(err.message));
            }
            callback(results);
          });
        }
      ], function (error, result) {
        if (error) {
          console.log("error processing issueCommentEvent ", error);
          res.status(500).send(error.message);
        } else {
          res.status(201).send(updateCount + " Github comment(s) copied to FreshDesk ticket");
        }
      });
    }
  }
});




var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('freshdesk-gitub app listening at http://%s:%s', host, port);
});
