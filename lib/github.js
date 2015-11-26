var config_data = require('./config');
var GitHubApi = require("github");
var async = require('async');

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

function authenticateGitHub(authenticateGitHubCallback) {
  github.authenticate({
    type: "basic",
    username: config_data.githubUser,
    password: config_data.githubPassword
  });
  authenticateGitHubCallback(null);
}

//create new github issue. Takes in fd ticket details object
//returns issue # created
function createIssue(ticketDetails, createIssueCallback) {
  //create new github issue
  //http://mikedeboer.github.io/node-github/#issues.prototype.create
  github.issues.create({
    user: config_data.githubUser,
    repo: config_data.repo,
    title: ticketDetails.subject,
    body: ticketDetails.description,
    labels: ['linked']
  }, function(err, result){
    if(err) {
      console.log("error in createIssue");
      createIssueCallback(new Error(err));
      return;
    } else {
      createIssueCallback(null, result.number);
    }
  });
}

//create comment on issue.
function createComment(issueNumber, comment, createCommentCallback) {
  //add comment to issue with link to ticket
  github.issues.createComment({
    user: config_data.githubUser,
    repo: config_data.repo,
    number: issueNumber,
    body: comment
  }, function(err, results) {
    if(err) {
      console.log("error in createComment ", err);
      createCommentCallback(new Error(err));
      return;
    } else {
      createCommentCallback(null);
    }
  });
}

function addIssueLabel(issueNumber, newLabel, addIssueLabelCallback) {
  var alreadyLabled = false;
  async.waterfall([
    authenticateGitHub,
    function(callback) {
      github.issues.getIssueLabels({
        user: config_data.githubUser,
        repo: config_data.repo,
        number: issueNumber
      }, function(err, results) {
        if(err) {
          console.log("Problem fetching issue labels");
          callback(new Error(err));
          return;
        } else {
          var labels = [];
          for(var i=0;i<results.length;i++) {
            if(results[i].hasOwnProperty('name')) {
              labels.push(results[i].name);
              if(results[i].name === newLabel) {
                alreadyLabled = true;
              }
            }
          }
          if(!alreadyLabled) {
            labels.push(newLabel);
          }
          callback(null, labels);
        }
      });
    },
    function(labels, callback) {
      if(alreadyLabled) {
        callback(null);
        return;
      }
      github.issues.edit({
        user: config_data.githubUser,
        repo: config_data.repo,
        number: issueNumber,
        labels: labels
      }, function(err, result) {
        if(err) {
          console.log("Problem updating github issue in addIssueLabel", err);
          addIssueLabelCallback(new Error(err));
          return;
        } else {
          callback(null);
        }
      });
    }
  ], function(error, result) {
    if(error) {
      console.log("Problem updating github issue ", error);
      addIssueLabelCallback(new Error(error.message));
      return;
    }
    addIssueLabelCallback(null);
  });
}

function removeIssueLabel(issueNumber, label, removeIssueLabelCallback) {
  async.waterfall([
    authenticateGitHub,
    function(callback) {
      github.issues.getIssueLabels({
        user: config_data.githubUser,
        repo: config_data.repo,
        number: issueNumber
      }, function(err, results) {
        if(err) {
          console.log("Problem fetching issue labels");
          callback(new Error(err));
          return;
        } else {
          var labels = [];
          for(var i=0;i<results.length;i++) {
            if(results[i].hasOwnProperty('name') && results[i].name !== label) {
              labels.push(results[i].name);
            }
          }
          callback(null, labels);
        }
      });
    },

    function(labels, callback) {
      github.issues.edit({
        user: config_data.githubUser,
        repo: config_data.repo,
        number: issueNumber,
        labels: labels
      }, function(err, result) {
        if(err) {
          console.log("Problem updating github issue in removeIssueLabel", err);
          removeIssueLabelCallback(new Error(err));
          return;
        } else {
          callback(null);
        }
      });
    }

  ], function(error, result) {
    if(error) {
      console.log("Problem updating github issue ", error);
      removeIssueLabelCallback(new Error(error.message));
      return;
    }
    removeIssueLabelCallback(null);
  });
}

function getIssue(issueNumber, getIssueCallback) {
  github.issues.getRepoIssue({
    user: config_data.githubUser,
    repo: config_data.repo,
    number: issueNumber,
  }, function(err, results) {
    if(err) {
      console.log("error retrieving GitHub issue");
      getIssueCallback(new Error(err));
      return;
    } else {
      getIssueCallback(null, results);
    }
  });
}

function getComments(issueNumber, getCommentsCallback) {
  async.waterfall([
    authenticateGitHub,
    function(callback) {
      github.issues.getComments({
        user: config_data.githubUser,
        repo: config_data.repo,
        number: issueNumber,
      }, function(err, results) {
        if(err) {
          console.log("error retrieving comments on GitHub issue");
          callback(new Error(err));
          return;
        } else {
          callback(null, results);
        }
      });
    }
  ], function(error, results) {
    if (error) {
      console.log("Problem with getting comments on GitHub issue ", error);
      getCommentsCallback(new Error(error.message));
      return;
    }
    getCommentsCallback(null, results);
  });
}

function getLinkedTickets(issueNumber, getLinkedTicketsCallback) {
  async.waterfall([
    function(callback) {
      callback(null, issueNumber);
    },
    getComments,
    function(comments, callback) {
      var fd_tickets = [];
      var sliceIndex;
      for (var i=0; i < comments.length; i++) {
        if (comments[i].body.indexOf(config_data.fd_url) >= 0) {
          sliceIndex = comments[i].body.lastIndexOf('/'); //find last '/' in url
          fd_tickets.push(comments[i].body.slice(sliceIndex+1)); //just grab the ticket number portion
        }
      }
      getLinkedTicketsCallback(null, fd_tickets);
    }
  ]);
}

module.exports.authenticate = authenticateGitHub;
module.exports.createIssue = createIssue;
module.exports.createComment = createComment;
module.exports.addIssueLabel = addIssueLabel;
module.exports.getIssue = getIssue;
module.exports.removeIssueLabel = removeIssueLabel;
module.exports.getComents = getComments;
module.exports.getLinkedTickets = getLinkedTickets;
