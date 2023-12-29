import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {TokenError, type Parser} from '.';
import {BaseState, BaseTable, BaseToken, JoinType, State, Table, Token} from './base';
import {ExpressionParenthesis, ParenthesisBody} from './paren';
import {Statement} from './statement';
import {IDENTIFIER, LITERAL, LexerType, ParserType} from './symbols';
import {isRegularIdentifier, nextTokenError, tokenError} from './utils';
import {OutputColumn, ValueExpression, ValueExpressionFactory} from './value-expression';

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select
export class SelectStatement extends Statement implements ParenthesisBody {

    type = ParserType.SelectStatement;
    parse() {
        const currToken = this.parser.currToken;
        let end = false;
        if (this.insideParenthesis && currToken.type === LexerType.RParen) {
            end = true;
            this.parser.index--;
        }
        if (currToken.type === LexerType.EOF || currToken.type === LexerType.DotColon) {
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
        const tokenText = currToken.text.toUpperCase();
        if (this.columnList.length === 0 && !this.star) {
            if (tokenText === 'FIRST') {
                if (this.skip) {
                    nextTokenError(this.parser, '"FIRST" must be before "SKIP"');
                }
                if (this.first) {
                    nextTokenError(this.parser, 'Duplicate "FIRST" statement');
                }
                this.first = new SelectFirst(this.parser);
                return this.parser.state.push(this.first);
            } else if (tokenText === 'SKIP') {
                if (this.skip) {
                    nextTokenError(this.parser, 'Duplicate "SKIP" statement');
                }
                this.skip = new SelectFirst(this.parser);
                return this.parser.state.push(this.skip);
            } else if (tokenText === 'FROM') {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: currToken.end,
                    message: 'No Columns in "SELECT" statement'
                });
                const newFrom = new FromSelect(this.parser);
                this.parser.state.push(newFrom);
                this.from = newFrom;
            } else if (currToken.type === LexerType.Asterisk) {
                if (this.columnList.length) {
                    nextTokenError(this.parser, `Columns and select asterisk provided`);
                }
                this.star = new SelectStar(this.parser);
            } else {
                this.addNewColumn();
            }
        } else {
            if (tokenText === 'FROM') {
                const newFrom = new FromSelect(this.parser);
                this.parser.state.push(newFrom);
                this.from = newFrom;
            } else if (tokenText === 'WHERE') {
                const newWhere = new Where(this.parser);
                this.parser.state.push(newWhere);
                this.where = newWhere;
            } else if (tokenText === 'SKIP') {
                nextTokenError(this.parser, '"SKIP" must come before column list');
            } else if (tokenText === 'FIRST') {
                nextTokenError(this.parser, '"FIRST" must come before column list');
            } else {
                nextTokenError(this.parser, 'Unknown Token: %s');
                this.parser.index++;
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

    where?: Where;

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
abstract class FirstAndSkip extends BaseState {
    delimiter?: Token;

    parse = () => {
        if (this.delimiter) return this.flush();
        if (this.parser.currToken.type === LexerType.LParen) {
            let token = this.parser.currToken;
            let parens = new ExpressionParenthesis(token, this.parser);
            this.parser.state.push(parens);
            this.delimiter = parens;

        } else if (this.parser.currToken.type === LexerType.Variable) {
            this.parser.index++;
            this.delimiter = this.parser.currToken;
        } else {
            if (LITERAL.has(this.parser.currToken.type)) {
                if (this.parser.currToken.type !== LexerType.Integer) {
                    this.parser.problems.push({
                        start: this.parser.currToken.start,
                        end: this.parser.currToken.end,
                        message: `Argument literal must be an integer, found ${this.parser.currToken.type}`
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
class SelectFirst extends FirstAndSkip {
    type = ParserType.First;
}
class SelectSkip extends FirstAndSkip {
    type = ParserType.Skip;
}

class SelectStar extends BaseToken {
    constructor(parser: Parser) {
        super({
            start: parser.index,
            end: ++parser.index,
            text: '*',
            type: ParserType.SelectStar
        });
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-joins
class JoinFrom extends BaseState {

    static validJoinTokens = new Set(['NATURAL', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER']);

    type = ParserType.Join;
    parse() {
        if (!this.source && !this.joinType) {
            if (JoinFrom.validJoinTokens.has(this.parser.currToken.text.toUpperCase())) {
                if (this.parser.currToken.text.toUpperCase() === 'JOIN') {
                    this.joinType = 'LEFT';
                } else if (this.parser.currToken.text.toUpperCase() === 'OUTER') {
                    this.joinType = 'LEFT';
                    this.parser.index++;
                } else {
                    if (this.parser.currToken.text.toUpperCase() === 'OUTER') {
                        this.parser.index++;
                        if (!JoinFrom.validJoinTokens.has(this.parser.currToken.text.toUpperCase())) {
                            throw new TokenError(this.parser.currToken, `"${this.parser.currToken.text}" is not a valid JOIN type`);
                        }
                    }
                    this.joinType = this.parser.currToken.text as JoinType;
                    this.parser.index++;
                }

                if (this.parser.currToken.text.toUpperCase() !== 'JOIN') {
                    throw new TokenError(this.parser.currToken, `Expected "JOIN" found ${this.parser.currToken}`);
                }
                this.parser.index++;
                return;
            } else if (['CROSS'].includes(this.parser.currToken.text.toUpperCase())) {
                // TODO: CROSS and NATURAL joins
                throw new Error('CROSS joins are not implemented');
            } else {
                throw new TokenError(this.parser.currToken, 'Unexpected Token: ' + this.parser.currToken.text);
            }
        }
        if (!this.source) {
            const source = table(this.parser);
            this.parser.state.push(source);
            this.source = source;
            return;
        }
        if (!this.condition) {
            switch (this.parser.currToken.text.toUpperCase()) {
                case 'ON':
                    this.parser.index++;
                    this.parser.state.push(new ValueExpressionFactory(this.parser, (b) => this.condition = b));
                    return;
                case 'USING':
                    this.parser.index++;
                    if (this.parser.currToken.type !== LexerType.LParen) {
                        throw new TokenError(this.parser.currToken, `Expected '(', found ${this.parser.currToken}`);
                    }
                    this.condition = new JoinColumnList(this.parser);
                    this.parser.index++;
                    return;
                default:
                    throw new TokenError(this.parser.currToken, `Expected 'USING' or 'ON' clause, found ${this.parser.currToken}`);
            }
        }
        this.end = this.condition.end;
        this.flush();
    }

    condition?: ValueExpression | JoinColumnList;

    source?: Table;
    joinType?: JoinType;
}

class JoinColumnList extends BaseState {
    columns: Token[] = [];
    type = ParserType.JoinColumnList;
    parse() {
        while (true) {
            const currToken = this.parser.currToken;
            if (IDENTIFIER.has(currToken.type)) {
                if (isRegularIdentifier(currToken)) {
                    if (currToken.isReserved) {
                        tokenError(this.parser, `Invalid alias, '%s' is a reserved keyword`);
                    } else if (currToken.isKeyword) {
                        nextTokenError(this.parser, `'%s' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`, DiagnosticSeverity.Warning);
                    }
                }
                this.columns.push(currToken);
                this.parser.index++;
            }
            if (currToken.type === LexerType.Comma) {
                this.parser.index++;
                continue;
            }
            if (currToken.type === LexerType.RParen) {
                this.parser.index++;
                break;
            }
            throw new TokenError(currToken);
        }
        this.end = this.parser.tokenOffset(-1).end;
        this.text = this.parser.currText.substring(this.start, this.end);
        return this.flush();
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-from
class FromSelect extends BaseState {

    joins: JoinFrom[] = [];

    source?: Table;
    type = ParserType.From;
    parse() {
        if (JoinFrom.validJoinTokens.has(this.parser.currToken.text.toUpperCase())) {
            let newJoin = new JoinFrom(this.parser);
            this.parser.state.push(newJoin);
            this.joins.push(newJoin);
        } else if (this.joins.length || this.source) {
            let lastToken = this.parser.tokenOffset(-1);
            this.end = lastToken.end;
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
        this.parser.index++;
    }
}

export function table(parser: Parser) {
    const currToken = parser.currToken;
    if (currToken.type === LexerType.LParen) {
        return new DerivedTable(parser);
    } else if (IDENTIFIER.has(currToken.type)) {
        if (parser.tokenOffset(1).type === LexerType.LParen) {
            return new Procedure(parser);
        }
        if (currToken.text.toUpperCase() === 'LATERAL') {
            throw new Error('Not Implemented');
        }
        return new BaseTable(parser);
    }
    nextTokenError(parser, 'Invalid Token: %s');
    return new UnknownTable(parser);
}

export class UnknownTable extends BaseTable {

    type = ParserType.UnknownTable;
    parse() {
        const token = this.parser.currToken;
        this.start = this.parser.index;
        this.identifier = token;
        this.parser.index++;

        this.parseAlias();

        this.flush();
    }
}

export class DerivedTable extends BaseTable implements State {
    paren?: ExpressionParenthesis;

    type = ParserType.DerivedTable;
    parse() {
        if (this.paren) {
            const lastToken = this.parser.tokenOffset(-1);
            if (lastToken.type === LexerType.RParen) {
                this.end = lastToken.end;
                this.text = this.parser.text.substring(this.start, this.end);
                this.parseAlias();
                this.flush();
            } else {
                nextTokenError(this.parser, `Unknown Token: %s`);
            }
        } else {
            this.paren = new ExpressionParenthesis(this.parser.currToken, this.parser);
            this.parser.state.push(this.paren);
        }
    }
}

export class Procedure extends BaseTable {

    args: Token[] = [];

    type = ParserType.Procedure;
    parse() {
        throw new Error('not implemented');
    }

}

class Where extends BaseState {

    type = ParserType.Where;
    condition?: ValueExpression;
    parse() {
        if (!this.condition) {
            this.parser.state.push(new ValueExpressionFactory(this.parser, (b) => this.condition = b));
            return;
        }
        this.end = this.condition.end;
        this.flush();
    }

    constructor(parser: Parser) {
        super(parser);
        this.parser.index++;
    }
}