// MIT License
//
// Copyright (c) 2023 Tobi
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// Slightly modified version from: https://github.com/tobilg/serverless-duckdb

import DuckDB, { DuckDbError, TableData } from 'duckdb';
import bunyan from 'bunyan';
import { getLogLevel } from './utils/logger';
import { metricScope, MetricsLogger, Unit } from 'aws-embedded-metrics';
import { renderResults } from './utils/resultsFormatter';

// Instantiate logger
const logger = bunyan.createLogger({
  name: 'duckdb-lambda-logger',
  level: getLogLevel()
});

// Instantiate DuckDB
const duckDB = new DuckDB.Database(':memory:', { allow_unsigned_extensions: 'true' });

// Create connection
const connection = duckDB.connect();

// Store initialization
let isInitialized = false;

// Promisify query method
async function query(sql: string): Promise<TableData> {
  return new Promise((resolve, reject) => {
    connection.all(sql, (err: DuckDbError | null, res: TableData) => {
      if (err) reject(err);
      resolve(res);
    });
  });
}

// SIGTERM Handler
process.on('SIGTERM', async () => {
  console.debug('[runtime] SIGTERM received');
  process.exit(0);
});

// todo: figure out types for event and context
export const handler = metricScope((metrics: MetricsLogger) => async (event: any, context: any) => {
  // Setup logger
  const requestLogger = logger.child({ requestId: context.awsRequestId });
  requestLogger.debug({ event, context });

  // Setup metrics
  metrics.putDimensions({ Service: 'QueryService' });
  metrics.setProperty('RequestId', context.awsRequestId);

  const sql = event.query;

  if (!sql) {
    throw 'Missing query property in request body!';
  }

  // Check if DuckDB has been initalized
  if (!isInitialized) {
    const initialSetupStartTimestamp = new Date().getTime();

    // Load httpsfs
    await query(`SET home_directory='/tmp';`);
    // Hint: INSTALL httpfs; is no longer needed, as it's now in the static build starting from layer version 6
    await query(`LOAD httpfs;`);

    // Whether or not the global http metadata is used to cache HTTP metadata, see https://github.com/duckdb/duckdb/pull/5405
    await query(`SET enable_http_metadata_cache=true;`);
    // Whether or not object cache is used to cache e.g. Parquet metadata
    await query(`SET enable_object_cache=true;`);

    requestLogger.debug({ message: 'Initial setup done!' });
    metrics.putMetric('InitialSetupDuration', new Date().getTime() - initialSetupStartTimestamp, Unit.Milliseconds);

    const awsSetupStartTimestamp = new Date().getTime();

    // Set AWS credentials
    // See https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime
    // await query(`SET s3_region='${process.env.AWS_REGION}';`);
    // await query(`SET s3_access_key_id='${process.env.AWS_ACCESS_KEY_ID}';`);
    // await query(`SET s3_secret_access_key='${process.env.AWS_SECRET_ACCESS_KEY}';`);
    // await query(`SET s3_session_token='${process.env.AWS_SESSION_TOKEN}';`);

    requestLogger.debug({ message: 'AWS setup done!' });
    metrics.putMetric('AWSSetupDuration', new Date().getTime() - awsSetupStartTimestamp, Unit.Milliseconds);

    // Store initialization
    isInitialized = true;
  }

  // Track query start timestamp
  const queryStartTimestamp = new Date().getTime();
  try {
    // Run query
    const queryResult = await query(sql);
    const queryTimeMs = new Date().getTime() - queryStartTimestamp;

    metrics.putMetric('QueryDuration', queryTimeMs, Unit.Milliseconds);

    return {
      statusCode: 200,
      body: renderResults(
        {
          timeMs: queryTimeMs,
          count: queryResult.length,
          result: queryResult,
          error: null
        },
        sql
      )
    };
  } catch (err: any) {
    requestLogger.error(err);
    return {
      statusCode: 400,
      body: renderResults(
        {
          timeMs: new Date().getTime() - queryStartTimestamp,
          count: null,
          result: null,
          error: err.message
        },
        sql
      )
    };
  }
});
