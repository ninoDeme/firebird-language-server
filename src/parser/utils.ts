import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseToken} from './base';

export function consumeWhiteSpace(parser: Parser) {
    const whitespace = parser.currText.match(/^\s+/);
    parser.index += whitespace?.[0].length ?? 0;
}

export function consumeCommentsAndWhitespace(parser: Parser, dontConsumeWhitespace?: boolean) {
    throw new Error('not used anymore');
}

export function nextTokenError(parser: Parser, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    parser.problems.push({
        start: parser.currToken.start,
        end: parser.currToken.start,
        message,
        severity
    });
}
