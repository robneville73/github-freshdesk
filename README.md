# github-freshdesk
Integrate issues on github with tickets in freshdesk.

This project creates a node based web service to receive webhook calls from Github and from Freshdesk for the purpose of integrating the issue tracking between the two systems. Freshdesk being a more appropriate forum for customer facing issues, including those that may result in code changes. In those cases it would be desirable to "hand off" the Fresh Desk ticket into a "developer issue" which is better tracked in github. It would also be good to synchronize additional notes from Freshdesk back to github as well as notify the freshdesk ticket at appropriate lifecycle points for the github change.

## Installation
 * You will need to host this node/express application on the public internet somewhere such that webhook calls from both github and freshdesk can find your application.
 * You will need to create a config.json file in the main directory with the following configuration options:
 
        {
          "repo": "your-github-repo-to-link-to",
          "githubUser": "yourgithubusername",
          "githubPassword": "yourgithubpassword",
          "fd_api": "Your freshdesk API key",
          "fd_url": "https://youruniqueurlto.freshdesk.com",
          "fd_customfield": "name of custom field you're using to track github issue number",
          "fd_customdevstatus": <integer> of your custom FreshDesk status that triggers a linkage to github
        }

 * FreshDesk's API doesn't provide an automated way to lookup the status. You'll have to look at their API docs https://freshdesk.com/api#view_a_ticket and run it against a ticket you've manually set to your target status and see what integer it assigns to it. Sorry...that kinda sucks but not sure what else to do about it.
