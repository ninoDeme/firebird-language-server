import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseToken} from './base';

export function consumeWhiteSpace(parser: Parser) {
    const whitespace = parser.currText.match(/^\s+/);
    parser.index += whitespace?.[0].length ?? 0;
}

export function consumeCommentsAndWhitespace(parser: Parser| string, dontConsumeWhitespace?: boolean) {
    let comment: RegExpMatchArray | null;
    if (typeof parser === 'string') {
        parser = new Parser(parser);
    }
    if (!dontConsumeWhitespace) consumeWhiteSpace(parser);
    do {
        comment = parser.currText.match(/^--.*|\/\*[\s\S]*?\*\//);
        if (comment?.[0].length) {
            parser.comments.push(new BaseToken({start: parser.index, end: parser.index + comment[0].length, text: comment[0]}));
            parser.index += comment[0].length;
            if (!dontConsumeWhitespace) consumeWhiteSpace(parser);
        }
    } while (comment?.[0].length);
    return {index: parser.index, comments: parser.comments}
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
