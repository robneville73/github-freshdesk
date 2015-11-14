var express = require('express');
var app = express();
var request = require('request');
var bodyParser = require('body-parser');
var toMarkdown = require('to-markdown');

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var GitHubApi = require("github");

var config_data = require('./lib/config');

var github = new GitHubApi({
  version: "3.0.0",
  debug: false,
  pathPrefix: "",
  host: "api.github.com",
  protocol: "https",
  headers: {
    "user-agent": "robneville73-github-freshdesk"
  }
});

function ticketUrl(id) {
  return config_data.fd_url+'/helpdesk/tickets/'+id+'.json';
}

function userUrl(id) {
  return config_data.fd_url+'/contacts/'+id+'.json';
}

//
// freshdeskHooks
//

//create a new github issue from a freshdesk ticket because the fd ticket
app.post('/api/freshdeskHook/createIssue/:id', function(apiRequest, response) {

  var ticketDetails = {
    id: apiRequest.params.id
  };
  var issueDetails = {};

  // FreshDesk custom fields have an internal globally unique name that's
  // linked to the name shown on the web so we need to grab all of the fields
  // from their API to get the real name of the field we're using to store the
  // github issue in
  var realCustomFieldName;
  request({
    url: config_data.fd_url + '/ticket_fields.json',
    method: 'GET',
    auth: {
      user: config_data.fd_api,
      pass: 'X'
    }
  }, function(err, res, body) {
    var fields = JSON.parse(body);
    for(var i=0; i < fields.length; i++) {
      if(fields[i].ticket_field.label_in_portal === config_data.fd_customfield) {
        realCustomFieldName = fields[i].ticket_field.name;
        lookupTicket();
      }
    }
  });

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

      ticketDetails.subject = body.helpdesk_ticket.subject;
      ticketDetails.description = body.helpdesk_ticket.description;
      ticketDetails.ticketUrl = config_data.fd_url + '/' + body.helpdesk_ticket.display_id;

      createIssue();
    }
  }

  //create new github issue
  function createIssue() {
    //create new github issue
    //http://mikedeboer.github.io/node-github/#issues.prototype.create
    authenticateGitHub();
    github.issues.create({
      user: config_data.githubUser,
      repo: config_data.repo,
      title: ticketDetails.subject,
      body: ticketDetails.description,
      labels: ['linked']
    }, function(err, result){
      if(err) {
        handleError("Error creating issue", err);
      } else {
        issueDetails.number = result.number;
        createComment();
      }
    });
  }

  //create new comment on the newly created issue
  function createComment() {
    //add comment to issue with link to ticket
    authenticateGitHub();
    github.issues.createComment({
      user: config_data.githubUser,
      repo: config_data.repo,
      number: issueDetails.number,
      body: ticketDetails.ticketUrl
    }, function(err, results) {
      if(err) {
        handleError("Error creating comment", err);
      } else {
        updateTicket();
      }
    });
  }

  //push new issue # back to custom field on freshdesk ticket
  //and send back a 201 if all goes OK
  function updateTicket() {
    var data = {
      "helpdesk_ticket": {
        "custom_field": {}
      }
    };

    data.helpdesk_ticket.custom_field[realCustomFieldName] = issueDetails.number;

    request({
      url: ticketUrl(ticketDetails.id),
      method: 'PUT',
      auth: {
        user: config_data.fd_api,
        pass: 'X'
      },
      json: true,
      body: data
    }, function(err, res, body) {
      if(err) {
        handleError("Error creating githubissue link on FreshDesk", err);
      } else {
        console.log("All done here...");
        response.status(201).send("Issue created.");
      }
    });
  }

  function handleError(msg, err) {
    console.log(msg + ' ', err);
    response.status(500).send(msg + ' '+ err);
  }

  function authenticateGitHub() {
    github.authenticate({
      type: "basic",
      username: config_data.githubUser,
      password: config_data.githubPassword
    });
  }
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
