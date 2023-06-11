import Result from './result';

const hardRowLimit = 20;

export function renderResults(results: Result, sql: string): string {
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
