import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';

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
