import * as fs from 'fs';
import {Parser} from './parser';

if (process.argv.length < 3) {
  console.error('Usage: node program.js <filename>');
  process.exit(1);
}

const fileName = process.argv[2];

fs.readFile(fileName, 'utf8', async (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }

  const parser = new Parser(data);

  parser.parse()

  console.log(parser.parsed)
  await new Promise(resolve => setTimeout(resolve, 500000));

});
