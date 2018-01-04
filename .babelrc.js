"use strict";

// Blame Logan for this.
// This works around https://github.com/istanbuljs/istanbuljs/issues/92 until
// we have a version of Istanbul that actually works with 7.x.
function istanbulHacks() {
  return {
    inherits: require("babel-plugin-istanbul").default,
    visitor: {
      Program: {
        exit: function(path) {
          if (!this.__dv__) return

          const node = path.node.body[0];
          if (
            node.type !== "VariableDeclaration" ||
            node.declarations[0].id.type !== "Identifier" ||
            !node.declarations[0].id.name.match(/cov_/) ||
            node._blockHoist !== 3
          ) {
            throw new Error("Something has gone wrong in Logan's hacks.");
          }

          // Gross hacks to put the code coverage block above all compiled
          // import statement output.
          node._blockHoist = 5;
        },
      },
    },
  };
}

let envOpts = {
  loose: true,
};

const config = {
  "presets": [
    ["@babel/preset-env", {
      "targets": {
        "node": ["8.9.4"]
      }
    }],
    "@babel/preset-react"
  ],
  "plugins": [
    "transform-class-properties",
    "transform-object-rest-spread",
    "transform-react-jsx",
    ["transform-inline-environment-variables", {
      "include": [
        "NODE_ENV",
        "KPR_ENV"
      ]
    }]
  ]
};

if (process.env.BABEL_ENV === "cov") {
  config.auxiliaryCommentBefore = "istanbul ignore next";
  config.plugins.push(istanbulHacks);
}

if (process.env.BABEL_ENV === "development") {
  envOpts.targets = {
    node: "current"
  };
  envOpts.debug = true;
}

module.exports = config;
