import { SlashCommand, CommandOptionType, SlashCreator, CommandContext } from 'slash-create';
import DuckDB, { DuckDbError, TableData } from 'duckdb';

// todo: should be split into separate success failure types and then use type to decide how to access result
interface Result {
  timeMs: number;
  count: number | null;
  error: DuckDbError | null;
  result: TableData | null;
}

const hardRowLimit = 20;

function renderResults(results: Result, sql: string): string {
  const timeText = `*Time: ${results.timeMs} ms.*`;
  const sqlText = '```sql\n' + sql + '\n```\n';
  if (results.error) {
    return (
      sqlText +
      'There was an error running the query:\n\n' +
      '```json\n' +
      JSON.stringify(results.error, null, 2) +
      '\n```\n\n' +
      timeText
    );
  } else if (results.count === 0) {
    return sqlText + 'Query returned no results.\n' + timeText;
  } else if (results.count !== null && results.result !== null && results.count > 0) {
    const rowsNum =
      results.count > hardRowLimit
        ? `*Showing first ${hardRowLimit} rows out of total: ${results.count}.*`
        : `*Rows: ${results.count}.*`;
    const data = results.result.slice(0, hardRowLimit).map((row) =>
      Object.values(row).map((v) => {
        if (v === true) return '*true*';
        else if (v === false) return '*false*';
        else if (v === null || v === undefined) return '*null*';
        else if (v === '') return '*empty string*';
        else return JSON.stringify(v);
      })
    );
    const headers = Object.keys(results.result[0]).map((v) => v.toString());
    const colLengths = headers.map((header) => header.length);
    data.forEach(function (record) {
      record.forEach(function (vl, indx) {
        if (vl.length > colLengths[indx]) colLengths[indx] = vl.length;
      });
    });
    const totalWidth =
      colLengths.map((c) => c + 2).reduce((accumulator, currentValue) => accumulator + currentValue, 0) +
      colLengths.length;
    const line = '-'.repeat(totalWidth) + '\n';
    const headerText = line + constructRowText(headers, colLengths) + line;
    const rowsText = data.map((row) => constructRowText(row, colLengths));
    if (totalWidth * data.length + sqlText.length > 1900)
      return (
        sqlText +
        '```\n' +
        headerText +
        rowsText.join('').slice(0, 1800 - sqlText.length) +
        line +
        '\n```\n' +
        rowsNum +
        ' ' +
        timeText +
        '\n**WARNING: Message was too long so table was cut off!**'
      );
    else return sqlText + '```\n' + headerText + rowsText.join('') + line + '\n```\n' + rowsNum + ' ' + timeText;
  } else return 'Something went wrong in the backend. Report an issue and include the query that you used.';
}

function constructRowText(row: string[], colLengths: number[]): string {
  const ret = row.map((v: string, idx: number) => {
    const padLen = colLengths[idx] - v.length > 0 ? colLengths[idx] - v.length : 0;
    return '| ' + ' '.repeat(padLen) + v + ' ';
  });
  return ret.reduce((accumulator: string, currentValue: string) => accumulator + currentValue, '') + '|\n';
}

module.exports = class DqlCommand extends SlashCommand {
  connection: DuckDB.Connection;

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

    // Instantiate DuckDB
    const duckDB = new DuckDB.Database(':memory:', { allow_unsigned_extensions: 'true' });

    // Create connection
    this.connection = duckDB.connect();
  }

  // Promisify query method
  async query(sql: string): Promise<TableData> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, (err: DuckDbError | null, res: TableData) => {
        if (err) reject(err);
        resolve(res);
      });
    });
  }

  async run(ctx: CommandContext) {
    const initialSetupStartTimestamp = new Date().getTime();

    // Load httpsfs
    await this.query(`SET home_directory='/tmp';`);
    // Hint: INSTALL httpfs; is no longer needed, as it's now in the static build starting from layer version 6
    await this.query(`LOAD httpfs;`);

    // Whether or not the global http metadata is used to cache HTTP metadata, see https://github.com/duckdb/duckdb/pull/5405
    await this.query(`SET enable_http_metadata_cache=true;`);
    // Whether or not object cache is used to cache e.g. Parquet metadata
    await this.query(`SET enable_object_cache=true;`);

    console.log(`Initial setup done! It took ${new Date().getTime() - initialSetupStartTimestamp} ms.`);

    let temp;
    // Track query start timestamp
    const queryStartTimestamp = new Date().getTime();

    try {
      // Run query
      const queryResult = await this.query(ctx.options.query);

      temp = {
        count: queryResult.length,
        result: queryResult,
        error: null
      };
    } catch (err: any) {
      temp = {
        count: null,
        result: null,
        error: err.message
      };
    }
    const queryTimeMs = new Date().getTime() - queryStartTimestamp;
    console.log(`Query finished, it took: ${queryTimeMs} ms.`);

    return renderResults(
      {
        timeMs: queryTimeMs,
        ...temp
      },
      ctx.options.query
    );
  }
};
