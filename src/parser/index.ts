import {State, BaseState, Problem, Token} from './base';
import {EmptyStatement, Statement, UnknownStatement} from './statement';
import {SelectStatement} from './select';
import {Token, Lexer} from './lexer';
import {TokenType} from './symbols';

export class Parser {

    constructor(lexer: Lexer, index: number = 0) {
        this.lexer = lexer;
        this.text = lexer.text;
        this.tokens = lexer.tokens;
        this.index = index;
    }

    tokens: Token[];

    private lexer: Lexer;
    state: State[] = [];
    parsed: BaseState[] = [];
    text: string;
    private _index!: number;
    public get index(): number {
        return this._index;
    }
    public set index(value: number) {
        if (value !== this._index) this._currText = undefined;
        this._index = value;
    }

    problems: Problem[] = [];

    private _currText: undefined | string;
    get currText() {
        return this._currText ?? (this._currText = this.text.substring(this.currToken.start));
    }

    get currToken() {
        return this.tokens[this.index];
    };

    tokenOffset(offset: number) {
        return this.tokens[this.index + offset];
    };

    parse() {
        try {
            let sameIndex = 0;
            let lastIndex = 0;
            this.index = 0;
            this.state = [statement(this)];

            while (this.state.length > 0) {
                this.state[this.state.length - 1].parse();

                if (lastIndex === this.index) sameIndex++
                else sameIndex = 0;

                if (sameIndex > 100) {
                    throw new TokenError(this.currToken, `Infinite Loop encountered at '${this.currToken.text}'`)
                }
            }

        } catch (e) {
            if (e instanceof TokenError) {
                this.problems.push({
                    start: e.token.start,
                    end: e.token.end,
                    message: e.message,
                    severity: 1
                })
            }
            console.error(e);
        }
        return this.parsed;
    }

    next() {
        this.state[this.state.length - 1].parse();
    }

    clone() {
        return new Parser(this.lexer, this.index)
    }
}

export function statement(parser: Parser, start: number = parser.index, subQuery?: boolean): Statement {
    const currToken = parser.currToken;
    if (currToken.type === TokenType.RegularIdentifier && currToken.text.toUpperCase() === 'SELECT') {
        return new SelectStatement(parser, start);
    }
    else if (currToken.type === TokenType.EOF || currToken.type === TokenType.DotColon || subQuery && currToken.type === TokenType.RParen) {
        return new EmptyStatement(parser);
    }
    return new UnknownStatement(parser, start);
}

export class TokenError extends Error {
    constructor(public token: Token, message?: string) {
        super(message || `Unexpected Token: ${token.text}`)
    }
}