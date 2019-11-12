import { buildSchema } from 'graphql';

export default buildSchema(`
  type Query {
    events(id: String!): [Event]
  }

  type Event {
    aggregate_id: String
    data: String
    version: Int
  }

  input InviteeInput {
    type: String
    id: String
  }

  type Mutation {
    createRoom(name: String!, description: String): String
    renameRoom(id: String!, name: String!): Boolean
    deleteRoom(id: String!): Boolean
    scheduleSession(roomId: String!, cron: String!, stopAfter: String): String
    invite(id: String!, invitees: [InviteeInput]): Boolean
  }
`);
