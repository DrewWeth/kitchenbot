var expect    = require("chai").expect;
var kb = require("../app/kitchenbot");

describe("Recipe Request", function(done) {
  kb.getRecipe(function(err, res){
    console.log(err);
    console.log(res);
    expect(res).to.equal(200);
    done();
  });
});
