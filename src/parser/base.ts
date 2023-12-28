import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {IDENTIFIER, LexerType, ParserType, TokenType} from './symbols';
import {LexedRegularIdentifier} from './lexer';

export abstract class BaseState implements State, Token {
    parser: Parser;
    static match: RegExp;
    parse() {
        throw new Error('not implemented');
    }
    flush() {
        this.parser.state.splice(this.parser.state.findIndex(el => el === this), 1);
    }
    text!: string;
    start!: number;
    end!: number;
    abstract type: TokenType;
    constructor(parser: Parser, start?: number) {
        this.parser = parser;
        this.start = start ?? parser.currToken.start;
    }
}

export abstract class BaseToken implements Token {
    text: string;
    start: number;
    end: number;
    type: TokenType;

    constructor(token: Token) {
        this.start = token.start;
        this.end = token.end;
        this.text = token.text;
        this.type = token.type;
    }
}

export class BaseTable extends BaseState implements Table {
    identifier?: Token;
    alias?: Token;
    type = ParserType.Table

    parse() {
        const token = this.parser.currToken;
        this.start = token.start;
        this.identifier = token;
        this.parser.index++;

        this.parseAlias();

        this.end = this.alias?.end || this.identifier.end;

        this.flush();
    }

    parseAlias() {

        let hasAS = false;
        if (this.parser.currToken.text.toUpperCase() === 'AS') {
            this.parser.index++;
            hasAS = true;
        }

        const token = this.parser.currToken;

        if (IDENTIFIER.has(token.type) && !(token as LexedRegularIdentifier).isReserved) {
            if ((token as LexedRegularIdentifier).isKeyword) {
                this.parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `'${token.text}' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`,
                    severity: DiagnosticSeverity.Warning
                });
            }
            this.alias = token;
            this.parser.index++;
        } else if (hasAS) {
            if ((token as LexedRegularIdentifier).isReserved) {
                this.parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `Invalid alias, '${token}' is a reserved keyword`
                });
                this.alias = token;
                this.parser.index++;
            } else {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: this.parser.index,
                    message: `Missing or invalid Alias`
                });
            }
        }
    }
}

export interface Table {
    identifier?: Token;
    alias?: Token;
}

export interface State {
    parser: Parser;
    parse: () => void;
    flush: () => void;
}

export interface Token {
    text: string;
    start: number;
    end: number;
    type: TokenType;
}


export interface FunctionBody extends State {
    insideFunction: boolean;
}


export interface Problem {
    start: number;
    end: number;
    message: string;
    severity?: DiagnosticSeverity;
}

export enum LiteralType {
    Integer,       // 0, -34, 45, 0X080000000;
    FixedPoint,    // 0.0, -3.14
    FloatingPoint, // 3.23e-23;
    String,        // 'text', 'don''t!';
    HexString,  // x'48656C6C6F20776F726C64'
    Date,          // DATE '2018-01-19';
    Time,          // TIME '15:12:56';
    Timestamp,     // TIMESTAMP '2018-01-19 13:32:02';
    Boolean,       // true, false, unknown
    Null,     // null
    Never
}

export type JoinType = 'natural' | 'inner' | 'left' | 'right' | 'full' | 'NATURAL' | 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';