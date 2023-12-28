import {TextDocument} from 'vscode-languageserver-textdocument';
import {State, BaseState, Problem, Token} from './base';
import {KEYWORDS, NON_REGULAR_IDENTIFIER_REGEX, OPERATORS_REGEX, REGULAR_IDENTIFIER_REGEX, RESERVED_WORDS, SPECIAL_CHARACTERS_REGEX, LexerType, VARIABLE_REGEX} from './symbols';

export class Lexer {

    constructor(document: TextDocument | string) {
        if (typeof document === 'string') {
            this.text = document;
        } else {

            this.text = document.getText();
        }
        this._index = 0;
    }
    state: State[] = [];
    parsed: BaseState[] = [];
    text: string;

    private _index: number;
    public get index(): number {
        return this._index;
    }
    public set index(value: number) {
        if (value !== this._index) this._currText = undefined;
        this._index = value;
    }

    comments: Token[] = [];
    whiteSpace: Token[] = [];
    tokens: Token[] = [];

    problems: Problem[] = [];

    private _currText: undefined | string;
    get currText() {
        return this._currText ?? (this._currText = this.text.substring(this.index));
    }

    parse() {
        try {
            this.index = 0;

        } catch (e) {
            console.error(e);
        }

        let match;
        do {
            match = this.getToken();
            if (match.type === LexerType.Comment) {
                this.comments.push(match)
            } else if (match.type === LexerType.WhiteSpace) {
                this.whiteSpace.push(match)
            } else {
                this.tokens.push(match);
            }
            this.index += match.text.length;
        } while (match?.type !== LexerType.EOF)

        // let qtds: {[key in TokenType]?: number} = {};
        // for (let t of this.tokens) {
        //     qtds[t.type] = (qtds[t.type] ?? 0) + 1
        // }
        // console.log(Object.entries(qtds).map(([key, value]) => `${TokenType[parseInt(key)]} => ${value}`))
        // console.log(`Comments => ${this.comments.length}`)
        // console.log(`WhiteSpace => ${this.whiteSpace.length}`)
        return this.parsed;
    }

    getToken(): Token {
        const currText = this.currText;
        if (currText.length === 0) {
            return this.token('', LexerType.EOF);
        }

        let token = matchWS(currText);
        if (token) {
            return this.token(token, LexerType.WhiteSpace);
        }

        if (token = currText.match(REGULAR_IDENTIFIER_REGEX)?.[0]) {
            let newToken = this.token(token, LexerType.RegularIdentifier) as LexedRegularIdentifier;
            if (KEYWORDS.has(token.toUpperCase())) {
                newToken.isKeyword = true;
                if (RESERVED_WORDS.has(token.toUpperCase())) {
                    newToken.isReserved = true;
                }
            }
            return newToken
        }

        if (currText.startsWith('.')) {
            return this.token('.', LexerType.Dot);
        }

        if (currText.startsWith(',')) {
            return this.token(',', LexerType.Comma);
        }

        if (currText.startsWith('"') && (token = currText.match(NON_REGULAR_IDENTIFIER_REGEX)?.[0])) {
            return this.token(token, LexerType.NonRegularIdentifier);
        }

        if (currText.startsWith(':') && (token = currText.match(VARIABLE_REGEX)?.[0])) {
            return this.token(token, LexerType.Variable);
        }

        if (currText.startsWith('_') && (token = currText.match(/^_[\w$]*/)?.[0])) {
            return this.token(token, LexerType.Introducer);
        }

        let stringToken: LexedString | null;
        if (stringToken = matchString(currText, this)) {
            return stringToken;
        }

        if (/^\d/.test(currText)) {
            if (token = currText.match(/^0x[\da-f]+/i)?.[0] || currText.match(/^\d+(?!\.|\d|e\d+)/)?.[0]) {
                return this.token(token, LexerType.Integer);
            }

            if (token = currText.match(/^\d+?\.\d+(?!\d|e\d+)/i)?.[0]) {
                return this.token(token, LexerType.FixedPoint);
            }

            if (token = currText.match(/^\d+\.?\d+e-?\d*(?!\d)/i)?.[0]) {
                return this.token(token, LexerType.FloatingPoint);
            }
        }
        if (currText.startsWith('(')) {
            return this.token('(', LexerType.LParen);
        }

        if (currText.startsWith(')')) {
            return this.token(')', LexerType.RParen);
        }

        if (currText.startsWith(';')) {
            return this.token(';', LexerType.DotColon);
        }

        if (currText.startsWith('*')) {
            return this.token('*', LexerType.Asterisk);
        }

        if (token = currText.match(/^(--.*|\/\*[\s\S]*?\*\/)/)?.[0]) {
            return this.token(token, LexerType.Comment);
        }

        if (token = currText.match(OPERATORS_REGEX)?.[0]) {
            return this.token(token, LexerType.Operator);
        }

        if (token = currText.match(SPECIAL_CHARACTERS_REGEX)?.[0]) {
            return this.token(token, LexerType.SpecialCharacter);
        }

        throw new Error("Unknown character: " + currText[0]);
    }

    token(text: string, type: LexerType) {
        let t: Partial<Token> = {};
        t.start = this.index;
        t.end = this.index + text.length;
        t.text = text;
        t.type = type;
        return t as Token;
    }
}

const DELIMITER_PAIR: {[key: string]: string} = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
}

const WHITESPACE = new Set(['\t', ' ', '\n', '\r', '\v', '\x12'])

function matchWS(currText: string): string | undefined {
    let index = 0
    for (let char of currText) {
        if (WHITESPACE.has(char)) {
            index++;
        } else {
            break;
        }
    }
    if (index > 0) {
        return currText.substring(0, index);
    }
    return undefined;
}

function matchString(currText: string, lexer: Lexer): LexedString | null {
    let res: RegExpMatchArray | null = null;
    if (currText.substring(0, 2).toLowerCase() === "q'") {
        let delimiter = currText[currText.length - 1];
        delimiter = DELIMITER_PAIR[delimiter] ?? delimiter;
        res = currText.match(new RegExp(`^q'.([\\s\\S]*?)(?:${delimiter}'|($))`, 'i'));
    }
    else if (currText.substring(0, 2).toLowerCase() === "x'") {
        res = currText.match(/^x'((?:[^']|'')*)(?:'|($))/i);
    } else if (currText.startsWith("'")) {
        res = currText.match(/^'((?:[^']|'')*)(?:'|($))/);
    }
    if (res) {
        let token: Partial<LexedString> = lexer.token(res[0], LexerType.String) as LexedString;
        token.contents = res[1];
        return token as LexedString;
    }
    return null;
}

export interface LexedRegularIdentifier extends Token {
    type: LexerType.RegularIdentifier;
    isKeyword?: boolean;
    isReserved?: boolean;
}

export interface LexedString extends Token {
    type: LexerType.String;
    contents: string;
}