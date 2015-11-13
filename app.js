var express = require('express');
var app = express();
var request = require('request');
var bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var GitHubApi = require("github");

var nconf = require('nconf');

nconf.file({
  file: 'config.json'
});

var repo = nconf.get('repo');
var githubUser = nconf.get('githubUser');
var githubPassword = nconf.get('githubPassword');
var fd_api = nconf.get('fd_api');
var fd_url = nconf.get('fd_url');
var fd_customfield = nconf.get('fd_customfield');

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
  console.log(fd_url);
  return fd_url+'/helpdesk/tickets/'+id+'.json';
}

//
// freshdeskHooks
//
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
    url: fd_url + '/ticket_fields.json',
    method: 'GET',
    auth: {
      user: fd_api,
      pass: 'X'
    }
  }, function(err, res, body) {
    var fields = JSON.parse(body);
    for(var i=0; i < fields.length; i++) {
      if(fields[i].ticket_field.label_in_portal === fd_customfield) {
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
        user: fd_api,
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
      ticketDetails.ticketUrl = fd_url + '/' + body.helpdesk_ticket.display_id;

      createIssue();
    }
  }

  //create new github issue
  function createIssue() {
    //create new github issue
    //http://mikedeboer.github.io/node-github/#issues.prototype.create
    authenticateGitHub();
    github.issues.create({
      user: githubUser,
      repo: repo,
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
      user: githubUser,
      repo: repo,
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

    console.log("data for PUT = ", data);
    request({
      url: ticketUrl(ticketDetails.id),
      method: 'PUT',
      auth: {
        user: fd_api,
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
      username: githubUser,
      password: githubPassword
    });
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

app.post('/api/freshdeskHook/createComment/:id', function(req, res) {
  res.json({
    message: "createComment",
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
