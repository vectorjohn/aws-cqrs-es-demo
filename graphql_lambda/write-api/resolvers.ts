import AWS from 'aws-sdk'
import { DynamoDB } from 'aws-sdk'
import uuid from 'uuid/v4'
import { EventType } from '../api-common/events'
import promisify from '../api-common/dynamo-promisify'

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

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const getEvents = async (id: string) => promisify<QueryOutput>((callback) =>
  // find all the Event items for the given aggregate. They will be sorted by version.
  dynamoDb.query({
    TableName: process.env.DYNAMODB_TABLE_EVENTS as string,
    KeyConditionExpression: `aggregate_id = :id`,
    ExpressionAttributeValues: {':id': id}
  }, callback)
)
.then(results => results.Items || [])

export const createRoom = async (name: string, description?: string) => {
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

export const deleteRoom = (id: string) =>
  saveEvent(id, EventType.ROOM_DELETED)

export const renameRoom = (id: string, name: string) =>
  saveEvent(id, EventType.ROOM_RENAMED, { name })

export const scheduleSession = (id: string, cron: string, stopAfter: string) => {
  // maybe look up the current schedules, see if this conflicts, etc.
  // general validation
  const scheduleId = uuid()
  return saveEvent(id, EventType.SESSION_SCHEDULED, {id: scheduleId, cron, stopAfter})
}

export const invite = (id: string, invitees: Array<{type: string, id: string}>) => {
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

  export default {
    events: (args: any) => getEvents(args.id),
    createRoom: (args: any) => createRoom(args.name, args.description),
    renameRoom: (args: {id: string, name: string}) => renameRoom(args.id, args.name),
    deleteRoom: (args: {id: string}) => deleteRoom(args.id),
    scheduleSession: (args: any) => scheduleSession(args.roomId, args.cron, args.stopAfter),
    invite: (args: any) => invite(args.id, args.invitees)
  };
