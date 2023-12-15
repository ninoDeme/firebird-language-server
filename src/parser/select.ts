import {type Parser} from '.';
import {BaseParenthesis, BaseState, BaseTable, BaseToken, EmptyParens, JoinType, ParenthesisBody, State, Table, Token} from './base';
import {Statement} from './statement';
import {LITERAL, REGULAR_IDENTIFIER, RESERVED_WORDS, TokenType} from './symbols';
import {consumeCommentsAndWhitespace, nextTokenError} from './utils';
import {OutputColumn} from './value-expression';

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select
export class SelectStatement extends Statement {

    parse = () => {
        const currToken = this.parser.currToken;
        let end = false;
        if (this.insideParenthesis && currToken.type === TokenType.RParen) {
            end = true;
        }
        if (currToken.type === TokenType.EOF || currToken.type === TokenType.DotColon) {
            if (this.insideParenthesis) {
                this.parser.problems.push({
                    start: this.start,
                    end: currToken.end,
                    message: 'Unclosed Subquery',
                });
            }
            end = true;
        }
        if (end) {
            if (!this.from) {
                this.parser.problems.push({
                    start: this.start,
                    end: currToken.end,
                    message: 'Missing "FROM" expression in "SELECT" statement',
                });
            }
            this.end = this.parser.currToken.end;
            this.parser.index++;
            this.text = this.parser.text.substring(this.start, this.end);
            return this.flush();
        }
        if (this.columnList.length === 0) {
            if (currToken.text.toUpperCase() === 'FIRST') {
                if (this.skip) {
                    nextTokenError(this.parser, '"FIRST" must be before "SKIP"');
                }
                if (this.first) {
                    nextTokenError(this.parser, 'Duplicate "FIRST" statement');
                }
                this.first = new SelectFirst(this.parser);
                return this.parser.state.push(this.first);
            } else if (currToken.text.toUpperCase() === 'SKIP') {
                if (this.skip) {
                    nextTokenError(this.parser, 'Duplicate "SKIP" statement');
                }
                this.skip = new SelectFirst(this.parser);
                return this.parser.state.push(this.skip);
            } else if (currToken.text.toUpperCase() === 'FROM') {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: currToken.end,
                    message: 'No Columns in "SELECT" statement'
                });
                const newFrom = new FromSelect(this.parser);
                this.parser.state.push(newFrom);
                this.from = newFrom;
            } else if (currToken.type === TokenType.Asterisk) {
                if (this.columnList.length) {
                    nextTokenError(this.parser, `Columns and select asterisk provided`);
                }
                this.star = new SelectStar(this.parser);
            } else {
                this.addNewColumn()
            }
        } else {
            if (currToken.text.toUpperCase() === 'FROM') {
                const newFrom = new FromSelect(this.parser);
                this.parser.state.push(newFrom);
                this.from = newFrom;
            } else if (currToken.text.toUpperCase() === 'SKIP') {
                nextTokenError(this.parser, '"SKIP" must come before column list');
            } else if (currToken.text.toUpperCase() === 'FIRST') {
                nextTokenError(this.parser, '"FIRST" must come before column list');
            } else {
                nextTokenError(this.parser, 'Unknown Token');
                this.parser.index;
            }
        }
    };

    addNewColumn() {
        const newColumn = new OutputColumn(this.parser, this);
        this.parser.state.push(newColumn);
        this.columnList.push(newColumn);
    }

    columnList: OutputColumn[] = [];
    star?: SelectStar;

    from?: FromSelect;

    first?: SelectFirst;
    skip?: SelectSkip;

    constructor(parser: Parser, start?: number, subQuery?: boolean) {
        super(parser, start, subQuery);
        this.parser.index++;
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-offsetfetch
// class SelectOffset extends BaseLimitToken {}
// class SelectFetch extends BaseLimitToken {}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-first-skip
class FirstAndSkip extends BaseState {
    delimiter?: Token;

    parse = () => {
        if (this.delimiter) return this.flush();
        if (this.parser.currToken.type === TokenType.LParen) {
            let token = this.parser.currToken;
            this.parser.index++;
            let body: ParenthesisBody;

            if (this.parser.currToken.text.toUpperCase() === 'SELECT') {
                body = new SelectStatement(this.parser);
            } else {
                body = new EmptyParens(this.parser);
            }

            let parens = new BaseParenthesis(token, body, this.parser);
            this.parser.state.push(parens);
            this.parser.state.push(body);
            this.delimiter = parens;

        } else if (this.parser.currToken.type === TokenType.Variable) {
            this.parser.index++;
            this.delimiter = this.parser.currToken;
        } else {
            if (LITERAL.has(this.parser.currToken.type)) {
                if (this.parser.currToken.type !== TokenType.Integer) {
                    this.parser.problems.push({
                        start: this.parser.currToken.start,
                        end: this.parser.currToken.end,
                        message: `Argument literal must be an integer, found ${TokenType[this.parser.currToken.type]}`
                    });
                }
                this.delimiter = this.parser.currToken;
                this.parser.index++;
            } else {
                this.delimiter = this.parser.currToken;
                this.parser.problems.push({
                    start: this.delimiter.start,
                    end: this.delimiter.end,
                    message: `Expected ${this.text.toUpperCase()} argument, found: "${this.delimiter.text}"`
                });
            }
        }
        if (this.delimiter) {
            this.end = this.delimiter.end;
        }
    };

    constructor(parser: Parser) {
        super(parser);
        this.text = this.parser.currToken.text;
        parser.index++;
    }
}
class SelectFirst extends FirstAndSkip {}
class SelectSkip extends FirstAndSkip {}

class SelectStar extends BaseToken {
    constructor(parser: Parser) {
        super({
            start: parser.index,
            end: ++parser.index,
            text: '*'
        });
        if (/^[^;,\s]/.test(parser.currText)) {
            nextTokenError(parser, `Invalid Token`);
        }
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-joins
class JoinFrom extends BaseState {

    parent: FromSelect;
    static validJoinTokens = new Set(['NATURAL', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL']);
    constructor(parser: Parser, parent: FromSelect) {
        super(parser);
        this.parent = parent;
    }

    parse() {
        consumeCommentsAndWhitespace(this.parser);

        if (!this.source) {
            let match: string | undefined;
            if (match = /^(natural|inner|left|right|full)([^\w$]|$)/i.exec(this.parser.currText)?.[0]) {
                this.type = match as JoinType;
                this.parser.index += match.length;
                consumeCommentsAndWhitespace(this.parser);
                if (!/^join([^\w$]|$)/i.test(this.parser.currText)) {
                    nextTokenError(this.parser, 'Expected "join" found _');
                } else {
                    this.parser.index += 'join'.length;
                }
            } else if (match = /^(join)([^\w$]|$)/i.exec(this.parser.currText)?.[0]) {
                this.type = 'left';
            }
        } else {
        }
    }

    source?: Table;
    type?: JoinType;
    flush() {
        this.parent.joins.push(this);
        super.flush();
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-from
class FromSelect extends BaseState {

    joins: JoinFrom[] = [];

    source?: Table;
    parse() {
        if (JoinFrom.validJoinTokens.has(this.parser.currToken.text.toUpperCase())) {
            this.parser.state.push(new JoinFrom(this.parser, this));
        } else if (this.joins.length || this.source) {
            if (this.joins.length) {
                this.end = this.joins[this.joins.length-1].end;
            }
            this.end = this.parser.index;
            this.text = this.parser.text.substring(this.start, this.end);
            this.flush();
        } else {
            const source = table(this.parser);
            this.parser.state.push(source);
            this.source = source;
        }
    }

    constructor(parser: Parser) {
        super(parser);
        this.parser.index += 'from'.length;
    }
}

export function table(parser: Parser) {
    consumeCommentsAndWhitespace(parser);
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

        consumeCommentsAndWhitespace(this.parser);

        let hasAS = false;
        if (this.parser.currText.match(/^as\s/i)) {
            this.parser.index += 2;
            consumeCommentsAndWhitespace(this.parser);
            hasAS = true;
        }

        const token = this.parser.currText.match(new RegExp(`^${REGULAR_IDENTIFIER}`))?.[0];

        if (token && !RESERVED_WORDS.has(token.toUpperCase())) {
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
        consumeCommentsAndWhitespace(this.parser);
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