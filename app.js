var express = require('express');
var app = express();
var request = require('request');
var bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

var GitHubApi = require("github");

var nconf = require('nconf');

nconf.argv().env().file({
  file: './package.json'
});

var repo = nconf.get('repo');
var githubUser = nconf.get('githubUser');
var githubPassword = nconf.get('githubPassword');
var fd_api = nconf.get('fd_api');
var fd_url = nconf.get('fd_url');

var Freshdesk = new fd(fd_url, fd_api);

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

//
// freshdeskHooks
//
app.post('/api/freshdeskHook/createIssue/:id', function(apiRequest, response) {

  var ticketDetails = {
    id: apiRequest.params.id
  };
  var issueDetails = {};

  Freshdesk.getTicket(ticketDetails.id, getTicketDetails);

  function getTicketDetails(err, res, body) {
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

  function updateTicket() {
    var data = {
      "helpdesk_ticket": {
        "custom_field": {
          "githubissue": issueDetails.number
        }
      }
    };
    var url = '/helpdesk/tickets/' + ticketDetails.id + '.json';
    Freshdesk.put(url, data, function(err, res, body) {
      if(err) {
        handleError("Error creating githubissue link on FreshDesk", err);
      } else {
        response.status(201);
      }
    });
  }

  function handleError(msg, err) {
    console.log(msg + ' ', JSON.parse(err));
    response.status(500).send(msg + ' '+ JSON.parse(err));
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
