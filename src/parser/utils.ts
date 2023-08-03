import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseToken} from './base';

export function consumeWhiteSpace(parser: Parser) {
    const whitespace = parser.currText.match(/^\s+/);
    parser.index += whitespace?.[0].length ?? 0;
}

export function consumeComments(parser: Parser) {
    let comment: RegExpMatchArray | null;
    do {
        comment = parser.currText.match(/^--.*|\/\*[\s\S]*?\*\//);
        if (comment?.[0].length) {
            parser.comments.push(new BaseToken({start: parser.index, end: parser.index + comment[0].length, text: comment[0]}));
            parser.index += comment[0].length;
            consumeWhiteSpace(parser);
        }
    } while (comment?.[0].length);
}

export function nextToken(parser: Parser): {start: number, end: number;} {
    const token = parser.currText.match(new RegExp(/^\S*/))?.[0] ?? '';
    return {start: parser.index, end: parser.index + token.length};
}

export function nextTokenError(parser: Parser, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    parser.problems.push({
        ...nextToken(parser),
        message,
        severity
    });
}
