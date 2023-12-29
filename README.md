# Firebird Language Server

Firebird SQL parser and language server

Experimental parser for firebird sql, made mostly for learning.

## Building

```console
npm run build
```

## Usage

This program can be used via the cli, as a lib, or as a standard language server

```js
import {Parser, Lexer} from './build/lib.js'
// ...

let lexer = new Lexer(sql);
lexer.parse();
let parser = new Parser(lexer);
parser.parse();
let ast = parser.parsed;
let problems = parser.problems;

```

```console
node ./build/cli.js teste.sql
```

for now running directly from the cli only makes sense while debugging

## Acknowledgments

  - [AST Explorer](https://github.com/fkling/astexplorer) - Helped a lot test and find bugs while developing

