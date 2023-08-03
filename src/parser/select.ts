import {Parser, table} from '.';
import {BaseState, BaseToken, Table} from './base';
import {Statement} from './statement';
import {REGULAR_IDENTIFIER} from './symbols';
import {consumeWhiteSpace, consumeComments, nextTokenError} from './utils';
import {OutputColumn} from './value-expression';

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select
export class SelectStatement extends Statement {

    parse = () => {
        consumeWhiteSpace(this.parser);
        consumeComments(this.parser);
        const currText = this.parser.currText;

        let end = this.parser.currText.match(/^[\s]*?(;|$)/)?.[0];
        if (this.subQuery) {
            if (end != null) {
                this.parser.problems.push({
                    start: this.start,
                    end: this.start + end.length,
                    message: 'Unclosed Subquery',
                });
            } else {
                end = this.parser.currText.match(/^[\s]*?\)/)?.[0];
            }
        }
        if (end != null) {
            if (!this.from) {
                this.parser.problems.push({
                    start: this.start,
                    end: this.parser.index + end.length,
                    message: 'Missing "FROM" expression in "SELECT" statement',
                });
            }
            this.parser.index += end.length;
            this.end = this.parser.index;
            this.text = this.parser.text.substring(this.start, this.end);
            this.flush();
        } else if (this.columnList.length === 0) {
            if (/^first\s/i.test(currText)) {
                if (this.skip) {
                    nextTokenError(this.parser, '"FIRST" must be before "SKIP"');
                }
                if (this.first) {
                    nextTokenError(this.parser, 'Duplicate "FIRST" statement');
                }
                this.first = new SelectFirst(this.parser);
            } else if (/^skip\s/i.test(currText)) {
                if (this.skip) {
                    nextTokenError(this.parser, 'Duplicate "SKIP" statement');
                }
                this.skip = new SelectSkip(this.parser);
            } else if (/^from\s/i.test(currText)) {
                if (this.columnList.length === 0) {
                    this.parser.problems.push({
                        start: this.parser.index,
                        end: this.parser.index,
                        message: 'No Columns in "SELECT" statement'
                    });
                }
            } else if (currText.startsWith('*')) {
                if (this.columnList.length) {
                    nextTokenError(this.parser, `Columns and select star provided`);
                }
                this.star = new SelectStar(this.parser);
            } else {
                this.addNewColumn();
            }
        } else {
            if (/^from\s/i.test(currText)) {
                const newFrom = new FromSelect(this.parser);
                this.parser.state.push(newFrom);
                this.from = newFrom;
            } else if (/^skip\s/i.test(currText)) {
                nextTokenError(this.parser, '"SKIP" must come before column list');
            } else if (/^first\s/i.test(currText)) {
                nextTokenError(this.parser, '"FIRST" must come before column list');
            } else {
                nextTokenError(this.parser, 'Unknown Token');
                this.parser.index += currText.match(/^(:?[\w$]+|$|.)/)?.[0]?.length ?? 1;
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
        this.parser.index += 'select'.length;
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-offsetfetch
// class SelectOffset extends BaseLimitToken {}
// class SelectFetch extends BaseLimitToken {}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-first-skip
class FirstAndSkip extends BaseToken {
    delimiter: number | string;

    constructor(parser: Parser) {
        const start = parser.index;
        let end: number | undefined;
        let text = parser.currText.match(/^(first|skip)/i)?.[0];
        if (!text) {
            throw new Error('first or skip token not present');
        }
        parser.index += text.length;
        consumeWhiteSpace(parser);
        consumeComments(parser);
        let delimiter: string | undefined;
        if (parser.currText.startsWith('(')) {
            let index = 0;
            let depth = 0;
            for (const i of parser.currText) {
                index++;
                if (i === '(') {
                    depth++;
                } else if (i === ')') {
                    depth--;
                }
                if (depth === 0) break;
            }
            if (depth !== 0) {
                parser.problems.push({
                    start: parser.index,
                    end: parser.index + 1,
                    message: 'Unclosed parenthesis'
                });
            }
            delimiter = parser.currText.slice(0, index);
            end = parser.index + index;
        } else if (parser.currText.startsWith(':')) {
            parser.index++;
            const identifier = parser.currText.match(new RegExp(`^${REGULAR_IDENTIFIER}(?=\\s|;)`))?.[0] ?? '';
            if (!identifier) {
                const token = parser.currText.match(/^\S*?/)?.[0] ?? '';
                parser.problems.push({
                    start: parser.index - 1,
                    end: parser.index + token.length,
                    message: `Invalid Parameter: :${token}`
                });
            }
            delimiter = `:${identifier}`;
            end = parser.index + delimiter.length;
        } else {
            delimiter = parser.currText.match(/^\S+/)?.[0];
            if (delimiter != null && !isNaN(parseInt(delimiter))) {
                if (parseInt(delimiter) < 0) {
                    parser.problems.push({
                        start: parser.index - 1,
                        end: parser.index + delimiter.length,
                        message: "Argument can't be negative"
                    });
                }
                end = parser.index + delimiter.length;
            } else if (delimiter === '?') {
                end = parser.index + delimiter.length;
            } else {
                parser.problems.push({
                    start: parser.index - 1,
                    end: parser.index + (delimiter?.length ?? 0),
                    message: `Invalid Token: ${delimiter}`
                });
                if (delimiter == null) delimiter = '';
            }
        }
        parser.index += delimiter.length;
        if (end == null) {
            throw new Error('End not defined');
        }
        super({start, end, text: parser.text.substring(start, end)});
        this.delimiter = delimiter;
    }
}
class SelectFirst extends FirstAndSkip {
    // constructor(parser: Parser) {
    //     super(parser);
    // }
}
class SelectSkip extends FirstAndSkip {
    constructor(parser: Parser) {
        super(parser);
    }
}

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
    constructor(parser: Parser, parent: FromSelect) {
        super(parser);
        this.parent = parent;
    }

    parse() {
        // TODO: Parse Join
        throw new Error('not implemented');
    }

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
        consumeWhiteSpace(this.parser);
        consumeComments(this.parser);

        if (/^(natural|join|inner|left|right|full)([^\w$]|$)/i.test(this.parser.currText)) {
            this.parser.state.push(new JoinFrom(this.parser, this));
        } else if (this.joins.length || this.source) {
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
