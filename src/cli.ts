import * as fs from "fs";
import { Lexer } from "./parser/lexer";
import { Parser, TokenError } from "./parser";
import { DiagnosticSeverity } from "vscode-languageserver-types";
import { complete } from "./completion-provider";

const Reset = "\x1b[0m";
const Bright = "\x1b[1m";
const Dim = "\x1b[2m";
const Underscore = "\x1b[4m";
const Blink = "\x1b[5m";
const Reverse = "\x1b[7m";
const Hidden = "\x1b[8m";
const FgBlack = "\x1b[30m";
const FgRed = "\x1b[31m";
const FgGreen = "\x1b[32m";
const FgYellow = "\x1b[33m";
const FgBlue = "\x1b[34m";
const FgMagenta = "\x1b[35m";
const FgCyan = "\x1b[36m";
const FgWhite = "\x1b[37m";
const FgGray = "\x1b[90m";
const BgBlack = "\x1b[40m";
const BgRed = "\x1b[41m";
const BgGreen = "\x1b[42m";
const BgYellow = "\x1b[43m";
const BgBlue = "\x1b[44m";
const BgMagenta = "\x1b[45m";
const BgCyan = "\x1b[46m";
const BgWhite = "\x1b[47m";
const BgGray = "\x1b[100m";

const SeverityText = {
    [DiagnosticSeverity.Error]: FgRed + "error" + Reset,
    [DiagnosticSeverity.Warning]: FgYellow + "warning" + Reset,
    [DiagnosticSeverity.Information]: FgBlue + "info" + Reset,
    [DiagnosticSeverity.Hint]: Reset + "hint",
};

if (process.argv.length < 3) {
    console.error("Usage: node program.js <filename>");
    process.exit(1);
}

const fileName = process.argv[2];

fs.readFile(fileName, "utf8", async (err, data) => {
    if (err) {
        console.error(`Error reading file: ${err.message}`);
        process.exit(1);
    }

    console.time("a");
    // for (let i = 0; i < 10000; i++) {
    const lexer = new Lexer(data);
    lexer.parse();

    const parser = new Parser(lexer);
    parser.parse();

    if (parser.problems.length) {
        for (let p of parser.problems) {
            let textUntilChar = data.substring(0, p.start).split("\n");
            let lineNumber = textUntilChar.length;
            let charNumber = textUntilChar.pop()?.length || 0;
            let line = data.split("\n")[lineNumber - 1];
            console.log(`\
${FgGreen}${fileName}:${lineNumber}:${charNumber}${Reset} - ${SeverityText[p.severity || 1]}: ${p.message}

${BgWhite}${FgBlack}${lineNumber}${Reset} ${line.substring(0, charNumber)}${Underscore}${line.substring(charNumber, p.end - (p.start - charNumber))}${Reset}${line.substring(p.end - (p.start - charNumber))}
      `);
        }
    }
    // }
    console.timeEnd("a");
    // console.log(lexer.tokens);
    // console.log(parser);
    // console.log(parser.parsed);
    // console.log(lexer.cursor);
    // console.log(lexer.tokens);
    console.log(complete(parser, lexer.cursor ?? 0));
    console.log("\nfinished");
    if (process.env.NODE_DEBUG)
        await new Promise((resolve) => setTimeout(resolve, 500000));
});
