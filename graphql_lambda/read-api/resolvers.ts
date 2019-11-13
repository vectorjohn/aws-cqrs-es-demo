import AWS from 'aws-sdk'
import { DynamoDB } from 'aws-sdk'
import { RoomDTO } from '../api-common/read-types'
import expectEnv from '../api-common/expect-env'
import promisify from '../api-common/dynamo-promisify'

type GetItemOutput = DynamoDB.DocumentClient.GetItemOutput
type QueryOutput = DynamoDB.DocumentClient.QueryOutput

const DYNAMODB_TABLE_CLASSCONNECT = expectEnv('DYNAMODB_TABLE_CLASSCONNECT')

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const getRooms = (): Promise<RoomDTO[]> => promisify<QueryOutput>((callback) =>
  dynamoDb.query({
    TableName: process.env.DYNAMODB_TABLE_CLASSCONNECT as string
  }, callback))
  .then((result) => {
    return (result.Items || []) as RoomDTO[]
  })
  .then(rooms => rooms
    .map(loadRoomFromResult)
    .filter(room => !!room) as RoomDTO[])

const roomById = (id: string) =>
  promisify<GetItemOutput>(callback => dynamoDb.get({
      TableName: DYNAMODB_TABLE_CLASSCONNECT as string,
      Key: { id: id },
    }, callback)
  )
  .then(result => loadRoomFromResult(result.Item as RoomDTO))

const loadRoomFromResult = (roomRecord: RoomDTO) => {
  if (roomRecord.deleted) {
    return null
  }
  return roomRecord
}

export default {
  rooms: () => getRooms(),
  roomById: (args: any) => roomById(args.id)
};
