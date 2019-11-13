import AWS from 'aws-sdk'
import { DynamoDB } from 'aws-sdk'
import promisify from '../api-common/dynamo-promisify'
import expectEnv from '../api-common/expect-env'
import { Event, EventType } from '../api-common/events'
import { Invitee, RoomDTO } from '../api-common/read-types'

type GetItemOutput = DynamoDB.DocumentClient.GetItemOutput
type PutItemOutput = DynamoDB.DocumentClient.PutItemOutput

const DYNAMODB_TABLE_CLASSCONNECT = expectEnv('DYNAMODB_TABLE_CLASSCONNECT')
const dynamoDb = new AWS.DynamoDB.DocumentClient();

type DomainEvent = {
  aggregateId: string,
  version: number,
  eventData: Event
}
type SQSEvent = {
  Records: Array<{body: string}>
}

export const onMessage = (event: SQSEvent, _context: any, cb: any) => {
  const rooms = new Map<string, Promise<RoomDTO>>()
  event.Records
    .map((sqsEvent): DomainEvent => JSON.parse(sqsEvent.body))
    .forEach((domainEvent) => {
      const id = domainEvent.aggregateId
      let curRoom = rooms.get(id)
      if (!curRoom) {
        curRoom = getCurrentRoom(id)
        rooms.set(id, curRoom)
      }

      // here one might throw an exception and re-queue an event
      // if domainEvent.version was not exactly room.version + 1.
      // Also, how do you re-queue a message in batch mode?
      const newRoom = curRoom
        .then(room => processEvent(room, domainEvent.version, domainEvent.eventData))
      rooms.set(id, newRoom)
    })

  return Promise.all(Array.from(rooms.values()))
    .then(newRooms => Promise.all(newRooms.map(saveRoom)))
    .then(() => cb(null))
    //TODO: Here we'd have to roll back the whole transaction maybe?
    // or actually, simply a re-queue of the message should work. We can
    // ignore messages that claim to be about an aggregate of an older
    // version than we know about. That is, if we actually check the version
    // when we write.
    .catch(err => cb(err))
}

// use for initializing a new room
const DEFAULT_ROOM: RoomDTO = {
  id: '',
  version: 0,
  schedules: [],
  invitees: [],
  deleted: false
}

const getCurrentRoom = (id: string) =>
  promisify<GetItemOutput>(callback => dynamoDb.get({
      TableName: DYNAMODB_TABLE_CLASSCONNECT as string,
      Key: { id: id },
    }, callback)
  )
  .then((result): RoomDTO => (result.Item as RoomDTO) || {id})
  // merge the loaded room into DEFAULT_ROOM, so that we know all fields are present
  // (this is to paper over bugs where an incomplete room was saved)
  .then(room => ({...DEFAULT_ROOM, ...room}))

const saveRoom = (room: RoomDTO) =>
  promisify<PutItemOutput>(callback => dynamoDb.put({
      TableName: process.env.DYNAMODB_TABLE_CLASSCONNECT as string,
      Item: room
    }, callback)
  )

const processEvent = (room: RoomDTO, version: number, event: Event) => {
    switch (event.type) {
      case EventType.ROOM_CREATED:
        return {
          ...room,
          version,
          name: event.name,
          description: event.description
        }
      case EventType.ROOM_RENAMED:
        return {
          ...room,
          version,
          name: event.name
        }
      case EventType.ROOM_DELETED:
        return {
          ...room,
          version,
          deleted: true
        }
      case EventType.SESSION_SCHEDULED:
        return {
          ...room,
          version,
          schedules: room.schedules.concat([{
            id: event.id,
            cron: event.cron,
            stopAfter: event.stopAfter
          }])
        }
      case EventType.ENTITY_INVITED:
        return {
          ...room,
          version,
          invitees: distinctInvitees(room.invitees.concat(event.invitees))
        }
      default:
        return room
    }
  }

const distinctInvitees = (invitees: Invitee[]) => {
  // distinct the invitees
  const inviteeMap = new Map<string, Invitee>()
  invitees.forEach(invitee => inviteeMap.set(invitee.type + invitee.id, invitee))
  return Array.from(inviteeMap.values())
}
