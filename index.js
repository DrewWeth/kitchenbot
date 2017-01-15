// Running code on KitchenBot's Lambda function in AWS

const querystring = require('querystring');
var util = require('util');
var exec = require('child_process').exec;

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
    session.attributes.waitingUserResponseToSend = false;
};

KitchenBot.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    makeJokeRequest(function(err, res){
       response.ask(res.text + '. I can give you a recipe.');
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
        setState(session, "waitingUserResponseToSend", false);
        handleGetRecipe(intent, session, response);
    },
    "OwnedIngredientIntent": function (intent, session, response) {
        setState(session, "waitingUserResponseToSend", false);
        handleOwnedIngredient(intent, session, response);
    },
    "JokeIntent": function (intent, session, response) {
        setState(session, "waitingUserResponseToSend", false);
        makeJokeRequest(function(err, res){
            response.ask(res.text, 'Did you like it?');
        });
    },
    "TriviaIntent": function (intent, session, response) {
        setState(session, "waitingUserResponseToSend", false);
        makeTriviaRequest(function(err, res){
            response.ask(res.text, 'Did you like it?');
        });
    },
    "SendRecipeIntent": function (intent, session, response) {
        setState(session, "waitingUserResponseToSend", false);
        if(session.attributes.recipes.length > 0){
            speechOutput = 'Great! Im sending it to you';
            sendText(session.attributes.recipes[0].spoonacularSourceUrl);
            response.tell(speechOutput);
        }
    },
    "MissingIngredientIntent": function (intent, session, response) {
        setState(session, "waitingUserResponseToSend", false);
        handleMissingIngredient(intent, session, response);
    },

    "YesIntent": function (intent, session, response) {
        handleYesIntent(intent, session, response);
    },

    "AMAZON.HelpIntent": function (intent, session, response) {
        setState(session, "waitingUserResponseToSend", false);
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

function setState(session, attr, val){
    session.attributes[attr] = val;
}

// -------------------------- TidePooler Domain Specific Business Logic --------------------------



function handleHelpRequest(response) {
    var repromptText = "What ingredients do you have?";
    var speechOutput = "You can tell me what ingredients you have and don't have and I will suggest recipes for you to make!"
        + repromptText;

    response.ask(speechOutput, repromptText);
}

function setSessionEndFalse(session){
  session.shouldEndSession = false;
}

function handleGetRecipe(intent, session, response) {
    makeRecipeRequest(session, function(err, res){
        console.log("Done with makeRecipeRequest");
        if(err !== null){
            console.log(err);
            response.ask("I didn't quite understand that.", "Reprompt text here");
            return;
        }
        var speechOutput = '';
        if(res.recipes !== undefined){
            var recipe = res.recipes[0];
            session.attributes.recipes = res.recipes.slice(0, 1);
            speechOutput = 'We can make ';
            speechOutput += recipe.title + '? ';
            speechOutput += 'it will take ' + recipe.readyInMinutes + ' minutes. ';
            var ingredientsNeeded = [];
            recipe.extendedIngredients.forEach(function(item){
                ingredientsNeeded.push(item.name);
            });
            speechOutput += 'Do you have ' + formatListWith(ingredientsNeeded, 'and') + '? ';
        }else if(res.results !== undefined){
            session.attributes.recipes = res.results.slice(0,1); // persist recipes in session
            speechOutput = 'We can make '+ res.results[0].title +' with your ingredients ';
            var options = [];
            // res.results = res.results.slice(0,1);
            // res.results.forEach(function(item){
            //   options.push({id: item.id, title: item.title, missed: item.missedIngredients});
            // });
            // speechOutput += formatListWith(options.map(function(e){return e.title}), 'or');

            if(res.results[0].missedIngredientCount > 0)
                speechOutput += '. Do you also have ' + res.results[0].missedIngredients.map(function(e){return e.name}).join(', ') + '?';
            else{
                speechOutput += '. Do you want me to send you the recipe?'
                session.attributes.waitingUserResponseToSend = true;
            }
        }else{
            console.log("Problem!", res);
        }

        console.log("speechOutput:", speechOutput);
        response.ask(speechOutput, "Do any of these recipes sound good?");
        return;
    });
}

function handleYesIntent(intent, session, response){
    speechOutput = '';
    if(session.attributes.waitingUserResponseToSend){
        speechOutput = 'Great! Im sending it to you';
        sendText(session.attributes.recipes[0].spoonacularSourceUrl);
        response.tell(speechOutput);
    }else{
        speechOutput = 'What did you mean?';
        response.ask(speechOutput);
    }
    session.attributes.waitingUserResponseToSend = false;
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

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function makeRecipeRequest(session, callback) {
    console.log("GetRecipe");
    var decidedPath = '';
    var ings = session.attributes.ingredients;
    if(isEmpty(ings)){
        decidedPath = '/recipes/random?limitLicense=false&number=3&tags=lunch';
    }else{
        decidedPath = '/recipes/searchComplex?';
        includeThese = [];
        excludeThese = [];
        for(var key in ings){
            if(ings[key] === true){
                includeThese.push(key);
            }else{
                excludeThese.push(key);
            }
        }
        queryObj = {};
        if(includeThese.length > 0)
            queryObj.includeIngredients = includeThese.join(',');
        if(excludeThese.length > 0 && includeThese.length > 0)
            queryObj.excludeIngredients = excludeThese.join(',');
        queryObj.number=3;
        queryObj.fillIngredients=true;
        // queryObj.type='main course';
        queryObj.ranking=2;
        decidedPath += querystring.stringify(queryObj);
        // decidedPath = decidedPath.replace('%2B', '_');
        console.log("Complex search path:", decidedPath);
    }

    makeSecureGetRequest(decidedPath, function(err, res){
        callback(err, res);
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
        console.log("Error", res);

        if (res.statusCode != 200) {
          callback(new Error("Non 200 error"));
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


function formatListWith(list, operator){
    if (list.length > 1){
        var res = '';
        for(var i = 0; i < list.length - 1; i++){
            res += list[i] + ', ';
        }
        res += ' ' + operator  + ' ' + list[list.length - 1];
        return res;
    }else{
        return list[0];
    }
}

function makeJokeRequest(callback){
    var desiredPath = '/food/jokes/random';
    makeSecureGetRequest(desiredPath, function(err, res){
        callback(err, res);
    });
}

function makeTriviaRequest(callback){
    var desiredPath = '/food/trivia/random';
    makeSecureGetRequest(desiredPath, function(err, res){
        callback(err, res);
    });
}

function sendText(recipe){
    var account = "AC29e7b96239c5f0bfc6ab8b724e263f30";
    var to="13147759588";
    var from = "13147363270";
    var body = recipe;
    var auth= "77d93608f97102a6011bb3fd90229a85";


    var command = "curl -X POST 'https://api.twilio.com/2010-04-01/Accounts/" + account+ "/Messages.json' --data-urlencode 'To="+ to
    +"' --data-urlencode 'From="+ from +"' --data-urlencode 'Body=" + body + "'  -u "+account+":"+auth;
    child = exec(command, function(error, stdout, stderr){

    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);

    if(error !== null)
    {
        console.log('exec error: ' + error);
    }

    });
}

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    var kitchenBot = new KitchenBot();
    kitchenBot.execute(event, context);
};
