import * as fs from 'fs';
import {Parser} from './parser';
import {Lexer} from './parser/lexer';
import {TokenType, VARIABLE_REGEX} from './parser/symbols';

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

  console.time('a');
  for (let i = 0; i < 10000; i++) {
  const lexer = new Lexer(data);
  lexer.parse();

  // const parser = new Parser(lexer);
  // parser.parse()

  }
  console.timeEnd('a');
  // console.log(lexer.tokens)
  // console.log(parser);
  // console.log(parser.parsed);
  await new Promise(resolve => setTimeout(resolve, 500000));

});
