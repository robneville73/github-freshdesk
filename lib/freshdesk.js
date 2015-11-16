var config_data = require('./config');
var request = require('request');

function connectFreshdesk(url, verb, callbackFn) {
  request({
    url: url,
    method: verb,
    auth: {
      user: config_data.fd_api,
      pass: 'X'
    }
  }, callbackFn);
}

function ticketUrl(id) {
  return config_data.fd_url+'/helpdesk/tickets/'+id+'.json';
}

function ticketFields(callbackFn) {
  connectFreshdesk(config_data.fd_url + '/ticket_fields.json', 'GET', callbackFn);
}

function getTicketFields(getTicketFieldsCallback) {
  ticketFields(function parseCustomFieldName(err, res, body) {
    if(err) {
      getTicketFieldsCallback(err);
    }
    var fields;
    try {
      fields = JSON.parse(body);
    } catch (error) {
      console.log("error parsing JSON in getTicketFields");
      getTicketFieldsCallback(error);
    }
    for(var i=0; i < fields.length; i++) {
      if(fields[i].ticket_field.label_in_portal === config_data.fd_customfield) {
        var realCustomFieldName = fields[i].ticket_field.name;
        getTicketFieldsCallback(null, realCustomFieldName);
      }
    }
  });
}

function lookupTicket(id, lookupTicketCallback) {
  connectFreshdesk(ticketUrl(id), 'GET', function(err, res, body) {
    if(err) {
      console.log("error processing lookupTicket");
      lookupTicketCallback(err);
    }
    lookupTicketCallback(null, body);
  });
}

function extractTicketDetails(ticketData, extractTicketDetailsCallback) {
  var ticketObj;
  var ticketDetails = {};
  try {
    ticketObj = JSON.parse(ticketData);
  } catch (error) {
    console.log("error parsing JSON in extractTicketDetails");
    extractTicketDetailsCallback(error);
  }

  ticketDetails.subject = ticketObj.helpdesk_ticket.subject;
  ticketDetails.description = ticketObj.helpdesk_ticket.description;
  ticketDetails.ticketUrl = config_data.fd_url + '/' + ticketObj.helpdesk_ticket.display_id;

  extractTicketDetailsCallback(null, ticketDetails);
}

function updateTicket(id, ticketUpdateObj, updateTicketCallback) {
  request({
    url: ticketUrl(id),
    method: 'PUT',
    auth: {
      user: config_data.fd_api,
      pass: 'X'
    },
    json: true,
    body: ticketUpdateObj
  }, function(err, res, body) {
    if(err) {
      console.log("error updating ticket in updateTicket");
      updateTicketCallback(err);
    } else {
      updateTicketCallback(null);
    }
  });
}

module.exports.getTicketFields = getTicketFields;
module.exports.lookupTicket = lookupTicket;
module.exports.extractTicketDetails = extractTicketDetails;
module.exports.updateTicket = updateTicket;
