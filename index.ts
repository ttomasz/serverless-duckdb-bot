import {
  SlashCreator,
  AWSLambdaServer,
  Response,
  TransformedRequest,
  CommandContext,
  InteractionRequestData,
  RespondFunction
} from 'slash-create';
import * as DqlCommand from './commands/dql';
import AWS from 'aws-sdk';

export const creator = new SlashCreator({
  applicationID: process.env.DISCORD_APP_ID as string,
  publicKey: process.env.DISCORD_PUBLIC_KEY,
  token: process.env.DISCORD_BOT_TOKEN
});

function respondFunction(interactionID: string, token: string): RespondFunction {
  return async (response: Response) => {
    await creator.api.interactionCallback(interactionID, token, response.body, response.files).catch((err) => {
      console.error('Error during interaction callback with params: ', interactionID, response.body, ' Error: ', err);
    });
  };
}

const server = new AWSLambdaServer(module.exports);
creator.withServer(server).registerCommand(DqlCommand);

// creator.on('rawREST', (request) => console.debug(request));
creator.on('rawRequest', (request: TransformedRequest) => {
  console.debug('request: ', request);
  const body: { follow_up: boolean | undefined; data: InteractionRequestData } = request.request;
  if (body.follow_up) {
    console.log('Following up on deferred message');
    const ctx = new CommandContext(
      creator,
      body.data,
      respondFunction(body.data.id, body.data.token),
      server.isWebserver
    );
    const lambda = new AWS.Lambda();
    try {
      lambda
        .invoke({
          FunctionName: 'serverless-duckdb-bot-prd-duckdb-query',
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({ query: ctx.options.query })
        })
        .send((err, data) => {
          if (err) {
            console.log(err);
            throw err;
          }
          console.debug(data);
          const result = JSON.parse(data.Payload as string);
          return ctx.sendFollowUp(result.body).catch((err) => {
            console.error(err);
          });
        });
    } catch (err) {
      console.error('Error during lambda invocation: ', err);
      return;
    }

  }
});
// creator.on('rawInteraction', (request) => console.debug(request));
creator.on('warn', (message) => console.warn(message));
creator.on('error', (error) => console.error(error));
creator.on('commandRun', (command, _, ctx) =>
  console.info(`${ctx.user.username}#${ctx.user.discriminator} (${ctx.user.id}) ran command ${command.commandName}`)
);
creator.on('commandError', (command, error) => console.error(`Command ${command.commandName}:`, error));
creator.on('unknownInteraction', (interaction) => {
  console.log('Unknown interaction: ', interaction);
});
