var express = require('express');
var app = express();

var GitHubApi = require("github");

var fd = require('freshdesk');

var repo = "https://github.com/robneville73/github-freshdesk";
var githubUser = "robneville73";
var fd_api = 'B1g7XInX5j12AhRc0htf';
var fd_url = 'http://retailarchitects.freshdesk.com';

var Freshdesk = new fd(fd_url, fd_api);

var github = new GitHubApi({
  version: "3.0.0",
  debug: true
});

//just making sure it works
// github.user.getFollowingFromUser({
//   user: "robneville73"
// }, function(err, res) {
//   console.log(JSON.stringify(res));
// });

//just making sure it works
// Freshdesk.listTickets(function(err, res, body) {
//   console.log("This tickets are: ", body);
// });

//
// freshdeskHooks
//
app.post('/api/freshdeskHook/createIssue/:id', function(req, res) {
  // * connects to freshdesk API to get ticket details
  // * connects to github API to create a new issue
  // * The content of the issue is copied from the ticket data
  // * "linked" label added to issue
  // * A new comment is added to the issue with the URL to the ticket
  // * The ticket is updated to reference issue # (custom field on ticket)
  // * A new note is added to the ticket with the URL to the issue.

  var ticketId = req.params.id;

  var ticket = Freshdesk.getTicket(ticketId, function(err, res, body) {
    //grab new ticket details
    //https://freshdesk.com/api#ticket
    var subject = body.subject;
    var description = body.description;
    var ticketUrl = fd_url + '/' + body.display_id;
    var issueId;

    //create new github issue
    //http://mikedeboer.github.io/node-github/#issues.prototype.create
    github.issues.create({
      user: githubUser,
      repo: repo,
      title: subject,
      body: description,
      labels: ['linked']
    }, function(err, result) {
      if(!err) {
        issueId = result.id;
      }
    });

    if(issueId) {
      //add comment to issue with link to ticket
      github.issues.createComment({
        user: githubUser,
        repo: repo,
        number: issueId,
        body: ticketUrl
      }, null);

      //update ticket custom field with issue number
      Freshdesk.putTicket(ticketId, {
        "helpdesk_ticket": {
          "custom_field": {
            "githubissue": issueId
          }
        }
      }, null);
    }
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

  console.log('Example app listening at http://%s:%s', host, port);
});
