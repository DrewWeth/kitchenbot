

console.log(command);


var util = require('util');
var exec = require('child_process').exec;


child = exec(command, function(error, stdout, stderr){

console.log('stdout: ' + stdout);
console.log('stderr: ' + stderr);

if(error !== null)
{
    console.log('exec error: ' + error);
}

});
