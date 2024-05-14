import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {IDENTIFIER, ParserType, TokenType} from './symbols';
import {LexedRegularIdentifier} from './lexer';

export abstract class BaseState implements State, Token {
    _parser: Parser;
    static match: RegExp;
    parse() {
        throw new Error('not implemented');
    }
    flush() {
        this._parser.state.splice(this._parser.state.findIndex(el => el === this), 1);
    }
    text!: string;
    start!: number;
    end!: number;
    abstract type: TokenType;
    constructor(parser: Parser, start?: number) {
        this._parser = parser;
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
        const token = this._parser.currToken;
        this.start = token.start;
        this.identifier = token;
        this._parser.index++;

        this.parseAlias();

        this.end = this.alias?.end || this.identifier.end;

        this.flush();
    }

    parseAlias() {

        let hasAS = false;
        if (this._parser.currToken.text.toUpperCase() === 'AS') {
            this._parser.index++;
            hasAS = true;
        }

        const token = this._parser.currToken;

        if (IDENTIFIER.has(token.type) && !(token as LexedRegularIdentifier).isReserved) {
            if ((token as LexedRegularIdentifier).isKeyword) {
                this._parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `'${token.text}' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`,
                    severity: DiagnosticSeverity.Warning
                });
            }
            this.alias = token;
            this._parser.index++;
        } else if (hasAS) {
            if ((token as LexedRegularIdentifier).isReserved) {
                this._parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `Invalid alias, '${token.text}' is a reserved keyword`
                });
                this.alias = token;
                if (!['ON', 'USING'].includes(token.text.toUpperCase())) {
                    this._parser.index++;
                }
            } else {
                this._parser.problems.push({
                    start: this._parser.index,
                    end: this._parser.index,
                    message: `Missing or invalid Alias`
                });
            }
        }
    }
}

export interface Table extends Token {
    identifier?: Token;
    alias?: Token;
}

export interface State {
    _parser: Parser;
    parse: () => any;
    flush: () => any;
}

export interface Token {
    text: string;
    start: number;
    end: number;
    type: TokenType;
}

export interface Context {
    token: Token;
    property?: string;
}

export interface FunctionBody extends State {
    insideFunction: boolean;
}

export interface ProblemFix {
    message: string;
    fixed?: string;
}

export interface ProblemError {
    start: number;
    end: number;
    message: string;
}

export interface Problem {
    start: number;
    end: number;
    message: string;
    error?: ProblemError
    fix?: ProblemFix
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
