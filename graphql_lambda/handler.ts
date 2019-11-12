import { Handler, Context } from 'aws-lambda';
import { graphql, buildSchema } from 'graphql';
import AWS from 'aws-sdk'
import { DynamoDB } from 'aws-sdk'
import uuid from 'uuid/v4'

type QueryOutput = DynamoDB.DocumentClient.QueryOutput
type PutItemOutput = DynamoDB.DocumentClient.PutItemOutput
type GetItemOutput = DynamoDB.DocumentClient.GetItemOutput

const EXPECTED_ENV = [
  'DYNAMODB_TABLE_AGGREGATES',
  'DYNAMODB_TABLE_EVENTS'
]

for (let i = 0; i < EXPECTED_ENV.length; i++) {
  if (!process.env[EXPECTED_ENV[i]]) {
    throw new Error('Missing environment variable: ' + EXPECTED_ENV[i])
  }
}

enum EventType {
  ROOM_CREATED = 'ROOM_CREATED',
  ROOM_RENAMED = 'ROOM_RENAMED',
  ROOM_DELETED = 'ROOM_DELETED',
  SESSION_SCHEDULED = 'SESSION_SCHEDULED',
  ENTITY_INVITED = 'ENTITY_INVITED'
}
interface UnknownEvent {
  type: "UNKNOWN"
}

interface RoomCreatedEvent {
  type: EventType.ROOM_CREATED;
  name: string;
  description?: string;
}

interface RoomRenamedEvent {
  type: EventType.ROOM_RENAMED;
  name: string;
}

interface RoomDeletedEvent {
  type: EventType.ROOM_DELETED;
}

interface SessionScheduledEvent {
  type: EventType.SESSION_SCHEDULED,
  id: string,
  cron: string,
  stopAfter: string
}

interface EntityInvitedEvent {
  type: EventType.ENTITY_INVITED,
  invitees: Array<{type: string, id: string}>
}

type Event =
  RoomCreatedEvent |
  RoomRenamedEvent |
  RoomDeletedEvent |
  SessionScheduledEvent |
  EntityInvitedEvent |
  UnknownEvent

type RoomSchedule = {
  id: string
  cron: string
  stopAfter: string
}

type Invitee = {
  type: string
  id: string
}

type RoomDTO = {
  id: string
  name?: string
  nr_id?: string
  description?: string
  deleted: boolean
  invitees: Invitee[]
  schedules: RoomSchedule[]
}
/*
// GraphQLSchema can be instantiated directly instead of using
// a string in buildSchema
const {
  graphql,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull
} = require('graphql')
*/

type DynamoResultHandler<T> = (error: Error, result: T) => void
const promisify = <T>(fn: (handler: DynamoResultHandler<T>) => any) => new Promise<T>((resolve, reject) => {
  fn((error: Error, result: T) => {
    if(error) {
      reject(error)
    } else {
      resolve(result)
    }
  })
})

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const schema = buildSchema(`
  type Query {
    hello: String
    rooms: [Room]
    roomById(id: String!): Room
  }

  type Room {
    id: String
    name: String
    nr_id: String
    description: String
    schedules: [Schedule]
    invitees: [Invitee]
  }

  type Invitee {
    type: String
    id: String
  }

  input InviteeInput {
    type: String
    id: String
  }

  type Schedule {
    id: String
    cron: String
    stopAfter: String
  }

  type Mutation {
    doFoo(bar: Int!): Boolean
    createRoom(name: String!, description: String): String
    renameRoom(id: String!, name: String!): Boolean
    deleteRoom(id: String!): Boolean
    scheduleSession(roomId: String!, cron: String!, stopAfter: String): String
    invite(id: String!, invitees: [InviteeInput]): Boolean
  }
`);

let state = {
  bars: 0
}
const root = {
  hello: () => `Hello world! (${state.bars})`,
  rooms: () => getRooms(),
  roomById: (args: any) => roomById(args.id),
  createRoom: (args: any) => createRoom(args.name, args.description),
  renameRoom: (args: {id: string, name: string}) => renameRoom(args.id, args.name),
  deleteRoom: (args: {id: string}) => deleteRoom(args.id),
  scheduleSession: (args: any) => scheduleSession(args.roomId, args.cron, args.stopAfter),
  invite: (args: any) => invite(args.id, args.invitees),
  doFoo: (args: any) => {console.log('args is ', args); state.bars += args.bar; return true;}
};

const getRooms = () => promisify<QueryOutput>((callback) =>
  dynamoDb.query({
    TableName: process.env.DYNAMODB_TABLE_AGGREGATES as string
  }, callback))
  .then((result) => {
    return (result.Items || []).filter(row => row.type === 'Room')
  })

const roomById = (id: any) => promisify<QueryOutput>((callback) =>
  // find all the Event items for the given aggregate. They will be sorted by version.
  dynamoDb.query({
    TableName: process.env.DYNAMODB_TABLE_EVENTS as string,
    KeyConditionExpression: `aggregate_id = :id`,
    ExpressionAttributeValues: {':id': id}
  }, callback)
)
// turn results into an array of parsed data, which is a JSON serialized Event
.then(results => (results.Items || []).map(event => JSON.parse(event.data || 'null') as Event))
// apply each event to an initially empty room to rebuild current state
.then(events => events.reduce((room, event) => {
  switch (event.type) {
    case EventType.ROOM_CREATED:
      room.id = id
      room.name = event.name
      room.description = event.description
      return room
    case EventType.ROOM_RENAMED:
      room.name = event.name
      return room
    case EventType.ROOM_DELETED:
      room.deleted = true
      return room
    case EventType.SESSION_SCHEDULED:
      room.schedules.push({
        id: event.id,
        cron: event.cron,
        stopAfter: event.stopAfter
      })
      return room
    case EventType.ENTITY_INVITED:
      room.invitees = room.invitees.concat(event.invitees)
      return room
    default:
      return room
  }
}, {id: '', deleted: false, schedules: [], invitees: []} as RoomDTO))
.then(room => {
  if (room.deleted) {
    return null
  }

  // distinct the invitees
  const invitees = new Map<string, Invitee>()
  room.invitees.forEach(invitee => invitees.set(invitee.type + invitee.id, invitee))
  room.invitees = Array.from(invitees.values())
  return room
})

const createRoom = async (name: string, description?: string) => {
  const id = uuid()
  const roomAggregate = {
    aggregate_id: id,
    type: 'Room',
    version: 0
  }
  const roomEvent = {
    aggregate_id: id,
    version: 0,
    data: JSON.stringify({type: EventType.ROOM_CREATED, name, description})
  }
  await promisify<PutItemOutput>(callback => dynamoDb.put({
      TableName: process.env.DYNAMODB_TABLE_AGGREGATES as string,
      Item: roomAggregate
    }, callback)
  )

  await promisify<PutItemOutput>(callback => dynamoDb.put({
      TableName: process.env.DYNAMODB_TABLE_EVENTS as string,
      Item: roomEvent
    }, callback)
  )

  return id
}

const deleteRoom = (id: string) =>
  saveEvent(id, EventType.ROOM_DELETED)

const renameRoom = (id: string, name: string) =>
  saveEvent(id, EventType.ROOM_RENAMED, { name })

const scheduleSession = (id: string, cron: string, stopAfter: string) => {
  // maybe look up the current schedules, see if this conflicts, etc.
  // general validation
  const scheduleId = uuid()
  return saveEvent(id, EventType.SESSION_SCHEDULED, {id: scheduleId, cron, stopAfter})
}

const invite = (id: string, invitees: Array<{type: string, id: string}>) => {
  return saveEvent(id, EventType.ENTITY_INVITED, { invitees })
}

const saveEvent = async (id: string, type: EventType, data?: any) => {
  const currentVersion = await findRoomAggregateVersion(id)

  await promisify<PutItemOutput>(callback => dynamoDb.put({
      TableName: process.env.DYNAMODB_TABLE_AGGREGATES as string,
      Item: {
        aggregate_id: id,
        version: currentVersion + 1
      }
    }, callback))

  await promisify<PutItemOutput>(callback => dynamoDb.put({
      TableName: process.env.DYNAMODB_TABLE_EVENTS as string,
      Item: {
        aggregate_id: id,
        version: currentVersion + 1,
        data: JSON.stringify({...data, type})
      }
    }, callback))

    return true
}

const findRoomAggregateVersion = (id: string) =>
  promisify<GetItemOutput>(callback => dynamoDb.get({
      TableName: process.env.DYNAMODB_TABLE_AGGREGATES as string,
      Key: { aggregate_id: id },
    }, callback)
  )
  .then(result => {
    if(!result.Item) {
      throw new Error("Room not found: " + id)
    }
    return result.Item.version
  })

const query: Handler = async (event: any, context: Context) => {
  console.log('context is', context)
  console.log('event is ', event)
  const response = await graphql(schema, event.body, root);
  console.log('graphql response: ', response);
  console.log('new state:', state)
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    },
    body: JSON.stringify(response)
  };
};

export { query }
