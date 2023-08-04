import {TextDocument} from 'vscode-languageserver-textdocument';
import {State, BaseState, Problem, BaseToken} from './base';
import {EmptyStatement, Statement, UnknownStatement} from './statement';
import {SelectStatement} from './select';
import {consumeCommentsAndWhitespace} from './utils';

export class Parser {

    constructor(document: TextDocument | string, index: number = 0) {
        if (typeof document === 'string') {
            this.text = document;
        } else {

            this.text = document.getText();
        }
        this._index = index;
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
    comments: BaseToken[] = [];

    problems: Problem[] = [];

    private _currText: undefined | string;
    get currText() {
        return this._currText ?? (this._currText = this.text.substring(this.index));
    }

    parse() {
        try {
            this.index = 0;
            this.state = [statement(this)];

            while (this.state.length > 0) {
                this.next();
            }

        } catch (e) {
            console.error(e);
        }
        return this.parsed;
    }

    next() {
        this.state[this.state.length - 1].parse();
    }

    clone() {
        return new Parser(this.text, this.index)
    }
}

export function statement(parser: Parser, start: number = parser.index, subQuery?: boolean): Statement {
    consumeCommentsAndWhitespace(parser);
    const currText = parser.currText;
    if (/^select/i.test(currText)) {
        return new SelectStatement(parser, start);
    }
    else if (/^(;|$)/.test(currText) || subQuery && /^\)/.test(currText)) {
        return new EmptyStatement(parser);
    }
    return new UnknownStatement(parser, start);
}