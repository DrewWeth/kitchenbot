/**
Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

http://aws.amazon.com/apache2.0/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

/**
* This sample shows how to create a Lambda function for handling Alexa Skill requests that:
* - Web service: communicate with an external web service to get tide data from NOAA CO-OPS API (http://tidesandcurrents.noaa.gov/api/)
* - Multiple optional slots: has 2 slots (city and date), where the user can provide 0, 1, or 2 values, and assumes defaults for the unprovided values
* - DATE slot: demonstrates date handling and formatted date responses appropriate for speech
* - Custom slot type: demonstrates using custom slot types to handle a finite set of known values
* - Dialog and Session state: Handles two models, both a one-shot ask and tell model, and a multi-turn dialog model.
*   If the user provides an incorrect slot in a one-shot model, it will direct to the dialog model. See the
*   examples section for sample interactions of these models.
* - Pre-recorded audio: Uses the SSML 'audio' tag to include an ocean wave sound in the welcome response.
*
* Examples:
* One-shot model:
*  User:  "Alexa, ask Tide Pooler when is the high tide in Seattle on Saturday"
*  Alexa: "Saturday June 20th in Seattle the first high tide will be around 7:18 am,
*          and will peak at ...""
* Dialog model:
*  User:  "Alexa, open Tide Pooler"
*  Alexa: "Welcome to Tide Pooler. Which city would you like tide information for?"
*  User:  "Seattle"
*  Alexa: "For which date?"
*  User:  "this Saturday"
*  Alexa: "Saturday June 20th in Seattle the first high tide will be around 7:18 am,
*          and will peak at ...""
*/

/**
* App ID for the skill
*/
var APP_ID = "amzn1.ask.skill.ba9ad130-2aaa-43a1-8692-3fa4bb09ddb4";//replace with 'amzn1.echo-sdk-ams.app.[your-unique-value-here]';

var https = require('https');

/**
* The AlexaSkill prototype and helper functions
*/
var AlexaSkill = require('./AlexaSkill');


var KitchenBot = function () {
  AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
KitchenBot.prototype = Object.create(AlexaSkill.prototype);
KitchenBot.prototype.constructor = KitchenBot;

// ----------------------- Override AlexaSkill request and intent handlers -----------------------

KitchenBot.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
  console.log("onSessionStarted requestId: " + sessionStartedRequest.requestId
  + ", sessionId: " + session.sessionId);
  // any initialization logic goes here
  session.attributes.ingredients = {};
  makeJokeRequest(function(err, res){
    response.tell(res.text);
  });
};

KitchenBot.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
  console.log("onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
  makeJokeRequest(function(err, res){
    response.tell(res.text);
  });
};

KitchenBot.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
  console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
  + ", sessionId: " + session.sessionId);
  // any cleanup logic goes here
  session.attributes.ingredients = {};
};

/**
* override intentHandlers to map intent handling functions.
*/
KitchenBot.prototype.intentHandlers = {
  "GetRecipeIntent": function (intent, session, response) {
    handleGetRecipe(intent, session, response);
  },
  "OwnedIngredientIntent": function (intent, session, response) {
    handleOwnedIngredient(intent, session, response);
  },
  "MissingIngredientIntent": function (intent, session, response) {
    handleMissingIngredient(intent, session, response);
  },

  "AMAZON.HelpIntent": function (intent, session, response) {
    handleHelpRequest(response);
  },

  "AMAZON.StopIntent": function (intent, session, response) {
    var speechOutput = "Goodbye";
    response.tell(speechOutput);
  },

  "AMAZON.CancelIntent": function (intent, session, response) {
    var speechOutput = "Goodbye";
    response.tell(speechOutput);
  }
};

// -------------------------- TidePooler Domain Specific Business Logic --------------------------



function handleHelpRequest(response) {
  var repromptText = "Which city would you like tide information for?";
  var speechOutput = "I can lead you through providing a city and "
  + "day of the week to get tide information, "
  + "or you can simply open Tide Pooler and ask a question like, "
  + "get tide information for Seattle on Saturday. "
  + "For a list of supported cities, ask what cities are supported. "
  + "Or you can say exit. "
  + repromptText;

  response.ask(speechOutput, repromptText);
}

function setSessionEndFalse(session){
  session.shouldEndSession = false;
}


function handleGetRecipe(intent, session, response) {
  makeRecipeRequest(session, function(err, res){
    if(err !== null){
      console.log(err);
      response.ask("Something went wrong.", "Reprompt text here");
      return;
    }
    var speechOutput = '';
    if(res.recipes !== undefined){
      session.attributes.recipes = res.recipes;
      speechOutput = 'Want to make ';
      speechOutput += res.recipes[0].title;
    }else if(res.results !== undefined){
      session.attributes.recipes = res.results; // persist recipes in session
      speechOutput = 'We can make these with your ingredients ';
      var options = [];
      res.results.forEach(function(item){
        options.push(item.title);
      });
      speechOutput += formatListWithOr(options);
    }else{
      console.log("Problem!", res);
    }

    response.ask(speechOutput, "Do any of these recipes sound good?");
    return;
  });
}

function handleOwnedIngredient(intent, session, response){
  var speechOutput = '';
  var ownedIngredients = intent.slots.OwnedIngredient.value;
  setAttribute(session, 'ingredients', ownedIngredients, true);
  console.log(ownedIngredients);
  speechOutput = 'You said you have ' + ownedIngredients + '. Done';
  response.ask(speechOutput);
}

function handleMissingIngredient(intent, session, response){
  var speechOutput = '';
  var missingIngredients = intent.slots.MissingIngredient.value;
  setAttribute(session, 'ingredients', missingIngredients, false);
  console.log(missingIngredients);
  speechOutput = 'You said you do not have ' + missingIngredients + '. Done';
  response.ask(speechOutput);
}

function makeRecipeRequest(session, callback) {
  console.log("GetRecipe");
  var decidedPath = '';
  var ings = session.attributes.ingredients;
  if(ings === undefined){
    decidedPath = '/recipes/random?limitLicense=false&number=1&tags=desert';
  }else{
    decidedPath = '/recipes/searchComplex';
    includeThese = [];
    excludeThese = [];
    for(var key in ings){
      if(ings[key] === true){
        includeThese.push(key);
      }else{
        excludeThese.push(key);
      }
    }
    decidedPath += '?includeIngredients=' + includeThese.join(',');
    decidedPath += '&excludeIngredients=' + excludeThese.join(',');
    decidedPath += '&number=3';
    decidedPath += '&fillIngredients=true';
    decidedPath += '&type=main+course';
    decidedPath += '&ranking=2';
    console.log("Complex search path:", decidedPath);
  }

  var err, res = makeSecureGetRequest(decidedPath, function(err, res){
    return err, res;
  });
}

function makeSecureGetRequest(decidedPath, callback){
  var options = {
    host: 'spoonacular-recipe-food-nutrition-v1.p.mashape.com',
    path: decidedPath,
    port: 443,
    method: 'GET',
    headers:{
      'X-Mashape-Key': 'iuzFMWlIRjmshyYHkfMtZNWRZPu9p1JxkBujsnciEh3Vz8vka6',
      'Accept': 'application/json'
    }
  };

  var req = https.request(options, function (res) {
    var noaaResponseString = '';
    console.log('Status Code: ' + res.statusCode);

    if (res.statusCode != 200) {
      callback(new Error("Non 200 Response"));
    }

    res.on('data', function (data) {
      noaaResponseString += data;
    });

    res.on('end', function () {
      var resObj = JSON.parse(noaaResponseString);

      if (resObj.error) {
        console.log("Res error: " + resObj);
        callback(new Error(resObj));
      } else {
        callback(null, resObj);
      }
    });
  }).on('error', function (e) {
    console.log("Communications error: " + e.message);
    callback(new Error(e.message));
  });
  req.end();
}

function setAttribute(session, attribute, key, value){
  if(session.attributes[attribute] === undefined){
    session.attributes[attribute] = {};
  }
  session.attributes[attribute][key] = value;
}

function formatListWithOr(list){
  if (list.length > 1){
    var res = '';
    for(var i = 0; i < list.length - 1; i++){
      res += list[i] + ', ';
    }
    res += ' or ' + list[list.length - 1];
    return res;
  }else{
    return list[0];
  }
}

function makeJokeRequest(session, callback){
  var desiredPath = '/food/jokes/random';
  makeSecureGetRequest(desiredPath, function(err, res){
    callback(err, res);
  });
}

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
  var kitchenBot = new KitchenBot();
  kitchenBot.execute(event, context);
};
