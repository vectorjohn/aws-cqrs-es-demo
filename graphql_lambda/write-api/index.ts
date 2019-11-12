import { graphql } from 'graphql';
import { Context } from 'aws-lambda';
import schema from './gql-schema'
import resolvers from './resolvers'

export default  async (event: any, context: Context) => {
  console.log('context is', context)
  console.log('event is ', event)
  const response = await graphql(schema, event.body, resolvers);
  console.log('graphql response: ', response);
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    },
    body: JSON.stringify(response)
  };
};
