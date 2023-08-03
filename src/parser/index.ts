import {REGULAR_IDENTIFIER, RESERVED_WORDS} from './symbols';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Connection } from 'vscode-languageserver';
import {Token, State, BaseState, Problem, BaseToken, BaseTable} from './base';
import {statement} from './statement';
import {consumeWhiteSpace, consumeComments, nextTokenError} from './utils';
import {SelectStatement} from './select';

export class Parser {

    constructor(connection: Connection) {
        this.connection = connection;
    }
    connection?: Connection;
    state: State[] = [];
    parsed: BaseState[] = [];
    text!: string;
    index: number = 0;
    comments: BaseToken[] = [];

    problems: Problem[] = [];

    get currText() {
        return this.text.substring(this.index);
    }

    parse(sql: TextDocument) {

        try {

            this.text = sql.getText();

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

}

export function table(parser: Parser) {
    consumeWhiteSpace(parser);
    consumeComments(parser);
    const currText = parser.currText;
    if (new RegExp(`^${REGULAR_IDENTIFIER}\\s*?\\(.*?\\)`).test(currText)) {
        return new Procedure(parser);
    }
    else if (currText.startsWith('(')) {
        return new DerivedTable(parser);
    } else if (new RegExp(`^${REGULAR_IDENTIFIER}([^\\w$]|$)`).test(currText)) {
        return new BaseTable(parser);
    }
    nextTokenError(parser, 'Invalid Token');
    return new UnknownTable(parser);
}

export class UnknownTable extends BaseTable {
    parse() {
        const token = this.parser.currText.match(new RegExp(`^[^;|\\s]`))?.[0];
        this.start = this.parser.index;
        this.name = token;
        this.parser.index += token?.length ?? 1;

        this.parseAlias();

        this.flush();
    }

    parseAlias() {

        consumeWhiteSpace(this.parser);
        consumeComments(this.parser);

        let hasAS = false;
        if (this.parser.currText.match(/^as\s/i)) {
            this.parser.index += 2;
            consumeWhiteSpace(this.parser);
            consumeComments(this.parser);
            hasAS = true;
        }

        const token = this.parser.currText.match(new RegExp(`^${REGULAR_IDENTIFIER}`))?.[0];

        if (token && !RESERVED_WORDS.includes(token.toUpperCase())) {
            if (hasAS) {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: this.parser.index + token.length,
                    message: `Invalid alias, ${token} is a reserved keyword`
                });
            }
            this.alias = token;
        }
    }
}

export class DerivedTable extends BaseTable implements State {
    select?: SelectStatement;

    parse() {
        consumeWhiteSpace(this.parser);
        consumeComments(this.parser);
        if (this.select) {
            if (this.parser.currText.startsWith(')')) {
                this.parser.index++;
                this.end = this.parser.index;
                this.text = this.parser.text.substring(this.start, this.end);
                this.flush();
            } else {
                nextTokenError(this.parser, `Unknown Token`);
            }
        }
    }
}

export class Procedure extends BaseTable {

    args: Token[] = [];

    parse() {
        throw new Error('not implemented');
    }

}