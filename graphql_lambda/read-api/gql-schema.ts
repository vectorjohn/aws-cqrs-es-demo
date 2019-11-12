import { buildSchema } from 'graphql';

export default buildSchema(`
  type Query {
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

  type Schedule {
    id: String
    cron: String
    stopAfter: String
  }
`);
