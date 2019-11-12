import { graphql } from 'graphql';
import schema from './gql-schema'
import resolvers from './resolvers'

export default  async (event: any) => {
  const response = await graphql(schema, event.body, resolvers);
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    },
    body: JSON.stringify(response)
  };
};
