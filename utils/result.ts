import { DuckDbError, TableData } from 'duckdb';

// todo: should be split into separate success failure types and then use type to decide how to access result
export default interface Result {
  timeMs: number;
  count: number | null;
  error: DuckDbError | null;
  result: TableData | null;
}
