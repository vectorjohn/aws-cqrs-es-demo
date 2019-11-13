
Getting Started
===============
Install serverless

    npm i serverless -g

Install dependencies

    npm install

Deploy to AWS

    serverless deploy

This requires that you have AWS credentials configured (i.e. you can use the aws cli). See https://serverless.com/ for setup information if that doesn't work.

Points of Interest
==================
These are some things to look at / basic overview of the project.

First, this project is built using the Serverless framework. So the first place
to look is the `serverless.yml` file which defines all the resources (lambdas,
database tables, queues, etc), as well as entrypoints to the lambdas. Under
`packages/functions` is where the lambda functions are defined. They have a name
and a handler which is a javascript module path. For example,
`event-processor/handler.onMessage` for the eventProcessor lambda says that the
handler is in the event-processor/handler module and calls the exported `onMessage`
function.

Because of how I structured this (and for expedience) you will notice that all
the lambdas have the same *code base* but they are very much independent servers
and a totally unconnected entrypoint is used for each. The only real downside
is that the size of the dependencies is cumulative. It's not a big deal but we
would want to fix that for production. They can be made to be separate npm
packages.

Project Structure
-----------------
The public API consists of the two lambdas `graphqlAction` and `graphqlQuery`.
These are separate lambdas to help enforce the separation of concerns. They
correspond to writes and reads respectively. Each one has a GraphQL schema.

The `graphqlAction` lambda should only handle mutations in its schema, and the
mutations should be defined to not return anything, or at the most an ID for
newly created resources (or errors if something goes wrong). `graphqlQuery`
handles reads. These are so separate that they don't even look at the same
database.

After the write-api writes new event records to its DynamoDB table, Dynamo emits
events for which there is a listener in the file `dynamo-stream-to-sqs.ts`. This
is a lambda that just takes events and sends them over to an SQS queue
called `NewEventsQueue`.

There is a listener lambda for messages on `NewEventsQueue` called `eventProcessor`.
This is responsible for building the read schema out of a sequence of events.
For example, if it sees a *ROOM_CREATED* event, it would create a new room record
and store that. If it sees a *ROOM_RENAMED* event, it looks up its previously
stored room record, updates the relevant fields (name) and then stores it.
If you have ever used Redux (usually used with React), you an think of this as
the reducer (or for functional programming, the common "reduce" function). It
takes the current version of a room, applies an event to it, and stores it.

Since standard SQS queues don't guarantee order (and since lambdas cannot
subscribe to FIFO queues), this lambda should be responsible for making sure
the events are in order using the event version. Versions are sequential integers
and never skip a version, so if a document is at version 5 and you get an event
saying that it expects version 8, the message must be requeued. This mechanism
is not done in the POC.

Finally, the read-api (`graphqlQuery` lambda) reads from the records managed by
the `eventProcessor`.

Data Structure
--------------
Event Sourcing means that our "source of truth" for what data we have is stored
as a sequence of *factual events that did happen*. From that, a more convenient
query-able data structure is constructed, but the source is always the sequence
of events. That means the read layer can be rebuilt trivially, or changed, or
created in different ways for different purposes (e.g. a nice searchable
elasticsearch for serving the UI and a convenient relational database for the
data warehouse).

Currently the project only uses DynamoDB because that was easy to configure in
a serverless way. Dynamo seems like a decent choice for the event layer but
our read layer may want to be something else.

* **EventsTable** is the main event store. Each *Item* has an *aggregate_id* (a UUID v4), a
  version, and data. The version is the current version of the *aggregate*, and the
  aggregate is basically a single entity. So aggregate 1234 might have 6 associated
  events (versions 0-5) corresponding to "create", "set a schedule", "invite person", "rename",
  "delete", etc. The state of the entity is fully described by all the event records
  in order. The `data` field is JSON and is freeform. The meaning is determined by code.
* **EventAggregatesTable** is not strictly necessary but it's a useful
  denormalization of the data. It saves having to look up all the events to find
  the latest one for finding the current version, for example.
* **ClassConnectTable** is the only table I have now for the read layer. This is
  managed by the `eventProcessor` and is read by the read-api (`graphqlQuery` lambda).
  Each item in here represents the full current state of an entity. For the POC
  it actually  just stores rooms which have an embedded list of schedules and
  invitees, although none of that is realistic looking.


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
