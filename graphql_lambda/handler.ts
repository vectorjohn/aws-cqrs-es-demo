import { Handler, Context } from 'aws-lambda';
import { graphql, buildSchema } from 'graphql';

const schema = buildSchema(`
  type Query {
    hello: String
  }

  type Mutation {
    doFoo(bar: Int!): Boolean
  }
`);

let state = {
  bars: 0
}
const root = {
  hello: () => `Hello world! (${state.bars})`,
  doFoo: (args: any) => {console.log('args is ', args); state.bars += args.bar; return true;}
};

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
