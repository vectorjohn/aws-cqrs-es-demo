
Getting Started
===============
Install serverless

    npm i serverless -g

Install dependencies

    npm install

Deploy to AWS

    serverless deploy

This requires that you have AWS credentials configured (i.e. you can use the aws cli). See https://serverless.com/ for setup information if that doesn't work.

Background
==========
The below are some of the steps I took to get started. This is very "serverless"
dependent.

Make sure serverless is installed (globally) and setup the serverless app from a template:

    npm i serverless -g
    serverless create --template aws-nodejs

Initialize the npm app and install typescript dependencies:

    npm init
    tsc --init
    npm i typescript serverless-offline serverless-plugin-typescript @types/aws-lambda --save-dev
    npm i graphql

In tsconfig.json, uncomment the rootDir line:

    "rootDir": "./",

Added to serverless.yml:

    plugins:
      - serverless-plugin-typescript
      - serverless-offline

Also in serverless.yml, under functions -> hello, add this to make it respond to HTTP:

    events:
      - http:
          path: hello
          method: get
