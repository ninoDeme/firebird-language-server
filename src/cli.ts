import * as fs from 'fs';
import {Parser} from './parser';
import {Lexer} from './parser/lexer';

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

  const lexer = new Lexer(data);

  lexer.parse()

  console.log(lexer.tokens)

  const parser = new Parser(lexer);

  parser.parse()

  console.log(parser);
  console.log(parser.parsed);
  await new Promise(resolve => setTimeout(resolve, 500000));

});
