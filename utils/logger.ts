import bunyan from 'bunyan';

export function getLogLevel(): bunyan.LogLevel {
  if (
    process.env.LOG_LEVEL &&
    process.env.LOG_LEVEL.toString()
      .toLowerCase()
      .match(/^trace|debug|info|warn|error|fatal$/)
  )
    return process.env.LOG_LEVEL as bunyan.LogLevel;
  else return bunyan.INFO;
}
