var config_data = require('./config');
var GitHubApi = require("github");

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
      createIssueCallback(err);
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
      console.log("error in createComment");
      createCommentCallback(err);
    } else {
      createCommentCallback(null);
    }
  });
}

module.exports.authenticate = authenticateGitHub;
module.exports.createIssue = createIssue;
module.exports.createComment = createComment;
