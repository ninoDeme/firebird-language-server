import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser, statement} from '.';
import {BaseState, State, Token} from './base';
import {LexerType, ParserType} from './symbols';
import {ParenthesisBody} from './paren';

export abstract class Statement extends BaseState implements ParenthesisBody {

    insideParenthesis: boolean;

    flush(state?: State) {
        this.parser.state.splice(this.parser.state.findIndex(el => el === state ?? this, 1))[0];
        this.parser.parsed.push(this);
        if (this.parser.index < this.parser.tokens.length && this.parser.state.length === 0) {
            this.parser.state.push(statement(this.parser));
        }
    }
    constructor(parser: Parser, start?: number, insideParenthesis?: boolean) {
        super(parser, start);
        this.insideParenthesis = !!insideParenthesis;
    }
}


export class EmptyStatement extends Statement {
    parse = () => {
        this.end = this.parser.index;
        this.text = this.parser.text.substring(this.start, this.end);
        this.parser.index++;
        this.flush();
    };

    type = ParserType.EmptyStatement
    constructor(parser: Parser, start?: number) {
        super(parser, start);
        this.parser.index++;
    }
}

export class UnknownStatement extends Statement {
    tokens: Token[] = [];
    type = ParserType.UnknownStatement
    parse() {
        let token = this.parser.currToken;
        if (token.type === LexerType.RegularIdentifier) {
            this.parser.problems.push({
                start: token.start,
                end: token.end,
                severity: DiagnosticSeverity.Error,
                message: `"${token.text}" is not a valid statement type`
            });
        } else {
            this.parser.problems.push({
                start: token.start,
                end: token.end,
                severity: DiagnosticSeverity.Error,
                message: `Expected statement type, received "${token.text}"`
            });
        }
        do {
            this.tokens.push(token);
            this.parser.index++;
            token = this.parser.currToken;
        } while (!(isEndOfStatement(token, this.insideParenthesis)))
        this.end = token.end;
        this.text = this.parser.text.substring(this.start, this.end);
        this.flush();
    }
}

export function isEndOfStatement(token: Token, subQuery?: boolean) {
    return token.type === LexerType.EOF || token.type === LexerType.DotColon || (subQuery && token.type === LexerType.RParen)
}