import { SQS } from 'aws-sdk'

const QUEUE_URL = process.env.NEW_EVENTS_QUEUE
if (!QUEUE_URL) {
  throw new Error("NEW_EVENTS_QUEUE environment variable not defined")
}

const sqs = new SQS()

export const handler = (event: any, _context: any, cb: any) => {
  if (!event.Records[0].dynamodb.NewImage) {
    // ignore if something is deleted from dynamo manually
    return cb(null)
  }
  const aggregateId = event.Records[0].dynamodb.NewImage.aggregate_id.S
  const version = event.Records[0].dynamodb.NewImage.version.N
  const eventData = JSON.parse(event.Records[0].dynamodb.NewImage.data.S)

  return sqs
    .sendMessage({
      QueueUrl: QUEUE_URL,
      // MessageGroupId: 'domainevent', // for FIFO queues only
      MessageBody: JSON.stringify({
        aggregateId,
        version,
        eventData
      })
    })
    .promise()
    .then(() => cb(null))
    .catch(err => {
      console.log(err)
      cb(err)
    })
}
