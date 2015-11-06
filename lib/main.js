var GitHubApi = require("github");

var github = new GitHubApi({
  version: "3.0.0",
  debug: true
});

github.user.getFollowingFromUser({
  user: "robneville73"
}, function(err, res) {
  console.log(JSON.stringify(res));
});
