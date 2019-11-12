import AWS from 'aws-sdk'
import { DynamoDB } from 'aws-sdk'
import { EventType, Event } from '../api-common/events'
import promisify from '../api-common/dynamo-promisify'

type QueryOutput = DynamoDB.DocumentClient.QueryOutput

const EXPECTED_ENV = [
  'DYNAMODB_TABLE_AGGREGATES',
  'DYNAMODB_TABLE_EVENTS'
]

for (let i = 0; i < EXPECTED_ENV.length; i++) {
  if (!process.env[EXPECTED_ENV[i]]) {
    throw new Error('Missing environment variable: ' + EXPECTED_ENV[i])
  }
}

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

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const getRooms = () => promisify<QueryOutput>((callback) =>
  dynamoDb.query({
    TableName: process.env.DYNAMODB_TABLE_AGGREGATES as string
  }, callback))
  .then((result) => {
    return (result.Items || []).filter(row => row.type === 'Room')
  })

export const roomById = (id: any) => promisify<QueryOutput>((callback) =>
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

export default {
  rooms: () => getRooms(),
  roomById: (args: any) => roomById(args.id)
};
