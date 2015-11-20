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

function userUrl(user_id) {
  return config_data.fd_url+'/contacts/'+user_id+'.json';
}

function noteUrl(id) {
  return config_data.fd_url+'/helpdesk/tickets/'+id+'/conversations/note.json';
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
      getTicketFieldsCallback(new Error(error));
      return;
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
  var ticketObj;
  connectFreshdesk(ticketUrl(id), 'GET', function(err, res, body) {
    if(err) {
      console.log("error processing lookupTicket");
      lookupTicketCallback(new Error(err));
      return;
    }
    try {
      ticketObj = JSON.parse(body);
    } catch (error) {
      console.log("error parsing JSON in lookupTicket");
      lookupTicketCallback(new Error(error));
      return;
    }
    lookupTicketCallback(null, ticketObj);
  });
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
      updateTicketCallback(new Error(err));
      return;
    } else {
      updateTicketCallback(null);
    }
  });
}

//get name of user_id that submitted the latest note
function lookupUserDetails(user_id, lookupUserCallback) {
  request({
    url: userUrl(user_id),
    method: 'GET',
    auth: {
      user: config_data.fd_api,
      pass: 'X'
    }
  }, function(err, res, body) {
    if(err) {
      console.log("error looking up user details in lookupUserDetails");
      lookupUserCallback(new Error(err));
      return;
    } else {
      var userObj;
      try {
        userObj = JSON.parse(body);
        userObj = userObj.user;
      } catch (error) {
        console.log("error parsing user details ", error);
        lookupUserCallback(new Error(error));
        return;
      }
      lookupUserCallback(null, userObj);
    }
  });
}

function addNote(id, note, addNoteCallback) {
  request({
    url: noteUrl(id),
    method: 'POST',
    auth: {
      user: config_data.fd_api,
      pass: 'X'
    },
    json: true,
    body: {
      "helpdesk_note" : {
        "body": note,
        "private": false
      }
    },
  }, function(err, res, body) {
    if(err) {
      console.log("error adding note");
      addNoteCallback(new Error(err));
      return;
    } else {
      addNoteCallback(null);
    }
  });
}

module.exports.getTicketFields = getTicketFields;
module.exports.lookupTicket = lookupTicket;
module.exports.updateTicket = updateTicket;
module.exports.lookupUserDetails = lookupUserDetails;
module.exports.addNote = addNote;
