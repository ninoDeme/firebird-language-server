import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {LexedRegularIdentifier} from './lexer';
import {LexerType} from './symbols';
import {Token} from './base';

export function nextTokenError(parser: Parser, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    parser.problems.push({
        start: parser.currToken.start,
        end: parser.currToken.end,
        message: message.replace('%s', parser.currToken.text),
        severity
    });
}

export function tokenError(parser: Parser, message: string, token = parser.currToken ,severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    parser.problems.push({
        start: token.start,
        end: token.end,
        message: message.replace('%s', token.text),
        severity
    });
}
export function isRegularIdentifier(token: Token): token is LexedRegularIdentifier {
    return token.type === LexerType.RegularIdentifier;
}