import { SlashCommand, CommandOptionType, SlashCreator, CommandContext } from 'slash-create';
import AWS from 'aws-sdk';

module.exports = class DqlCommand extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'dql',
      description: 'Runs provided SQL query.',
      options: [
        {
          type: CommandOptionType.STRING,
          name: 'query',
          description: 'SQL e.g. select 42 as col1',
          required: true
        }
      ]
    });

    this.filePath = __filename;
  }

  async run(ctx: CommandContext) {
    // Start a new lambda
    const lambda = new AWS.Lambda();
    const payload = { follow_up: true, version: '2.0', data: ctx.data };
    console.debug(ctx);
    console.debug(payload);
    try {
      await lambda
        .invoke({
          FunctionName: 'serverless-duckdb-bot-prd-discord-bot',
          InvocationType: 'Event',
          Payload: JSON.stringify(payload)
        })
        .send((err, data) => {
          if (err) {
            console.log(err);
            throw err;
          }
          console.debug(data);
        });
    } catch (err) {
      console.error('Error during lambda invocation: ', err);
      return;
    }
    try {
      // tell discord that the bot is thinking
      console.debug('Send deferral message: ', await ctx.defer());
    } catch (err) {
      console.error('There was an error sending defer signal: ', err);
    }
  }
};
