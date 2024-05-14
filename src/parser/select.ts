import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {TokenError, type Parser} from '.';
import {BaseState, BaseTable, BaseToken, JoinType, State, Table, Token} from './base';
import {ExpressionParenthesis, ParenthesisBody} from './paren';
import {Statement, isEndOfStatement} from './statement';
import {IDENTIFIER, LITERAL, LexerType, ParserType} from './symbols';
import {isRegularIdentifier, nextTokenError, tokenError} from './utils';
import {OutputColumn, ValueExpression, ValueExpressionFactory} from './value-expression';

const SELECT_ORDER = [['first'], ['skip'], ['columnList', 'Column List'], ['from'], ['join'], ['where'], ['groupBy', 'GROUP BY clause'], ['window'], ['plan'], ['union'], ['orderBy', 'OBDER BY clause'], ['rows'], ['offset'], ['fetch'], ['forUpdate', 'FOR UPDATE clause'], ['withLock', 'WITH LOCK clause'], ['into']];

function checkSelectOrder(select: SelectStatement, el: string) {
    let orderIndex = SELECT_ORDER.findIndex(item => item[0] === el);
    if (orderIndex === -1) {
        throw new Error(`Unknown Select Element: ${el}`);
    }
    if (select.orderIndex! === orderIndex + 1) {
        throw new TokenError(select._parser.currToken, `Duplicate ${SELECT_ORDER[orderIndex][1] ?? `${el} clause`} in select statement`);
    }
    if (select.orderIndex! > orderIndex) {
        throw new TokenError(select._parser.currToken, `${SELECT_ORDER[orderIndex][1] ?? `${el} clause`} in incorrect order on select statement`);
    }
    return orderIndex + 1;
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select
export class SelectStatement extends Statement implements ParenthesisBody {

    type = ParserType.SelectStatement;

    orderIndex?: number;
    parse() {
        this.orderIndex ??= 0;
        const currToken = this._parser.currToken;
        let end = false;
        if (this.insideParenthesis && currToken.type === LexerType.RParen) {
            end = true;
            this._parser.index--;
        }
        if (currToken.type === LexerType.EOF || currToken.type === LexerType.DotColon) {
            if (this.insideParenthesis) {
                this._parser.problems.push({
                    start: this.start,
                    end: currToken.end,
                    message: 'Unclosed Subquery',
                });
            }
            end = true;
        }
        if (end) {
            if (!this.from) {
                this._parser.problems.push({
                    start: this.start,
                    end: currToken.end,
                    message: 'Missing "FROM" expression in "SELECT" statement',
                });
            }
            this.end = this._parser.currToken.end;
            this._parser.index++;
            this.text = this._parser.text.substring(this.start, this.end);
            return this.flush();
        }

        const tokenText = currToken.text.toUpperCase();
        if (tokenText === 'FIRST') {
            this.orderIndex = checkSelectOrder(this, 'first');
            this.first = new SelectFirst(this._parser);
            return this._parser.state.push(this.first);
        }
        if (tokenText === 'SKIP') {
            this.orderIndex = checkSelectOrder(this, 'skip');
            this.skip = new SelectFirst(this._parser);
            return this._parser.state.push(this.skip);
        }
        if (currToken.type === LexerType.Asterisk) {
            this.orderIndex = checkSelectOrder(this, 'columnList');
            return this.star = new SelectStar(this._parser);
        }
        if (tokenText === 'FROM') {
            if (this.columnList.length === 0 && !this.star) {
                this._parser.problems.push({
                    start: this._parser.index,
                    end: currToken.end,
                    message: 'No Columns in "SELECT" statement'
                });
                this.orderIndex = 4;
            } else {
                this.orderIndex = checkSelectOrder(this, 'from');
            }
            const newFrom = new FromSelect(this._parser);
            this._parser.state.push(newFrom);
            return this.from = newFrom;
        }
        if (tokenText === 'WHERE') {
            this.orderIndex = checkSelectOrder(this, 'where');
            const newWhere = new Where(this._parser);
            this._parser.state.push(newWhere);
            return this.where = newWhere;
        }
        if (tokenText === 'GROUP') {
            this.orderIndex = checkSelectOrder(this, 'groupBy');
            const newGroupBy = new GroupBy(this._parser);
            this._parser.state.push(newGroupBy);
            return this.groupBy = newGroupBy;
        }
        if (this.columnList.length === 0 && !this.star) {
            this.orderIndex = checkSelectOrder(this, 'columnList');
            return this.addNewColumn();
        }
        throw new TokenError(this._parser.currToken);
    };

    addNewColumn() {
        const newColumn = new OutputColumn(this._parser, this);
        this._parser.state.push(newColumn);
        this.columnList.push(newColumn);
    }

    columnList: OutputColumn[] = [];
    star?: SelectStar;

    from?: FromSelect;

    where?: Where;

    groupBy?: GroupBy;

    first?: SelectFirst;
    skip?: SelectSkip;

    constructor(parser: Parser, start?: number, subQuery?: boolean) {
        super(parser, start, subQuery);
        this._parser.index++;
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
        if (this._parser.currToken.type === LexerType.LParen) {
            let token = this._parser.currToken;
            let parens = new ExpressionParenthesis(token, this._parser);
            this._parser.state.push(parens);
            this.delimiter = parens;

        } else if (this._parser.currToken.type === LexerType.Variable) {
            this._parser.index++;
            this.delimiter = this._parser.currToken;
        } else {
            if (LITERAL.has(this._parser.currToken.type)) {
                if (this._parser.currToken.type !== LexerType.Integer) {
                    this._parser.problems.push({
                        start: this._parser.currToken.start,
                        end: this._parser.currToken.end,
                        message: `Argument literal must be an integer, found ${this._parser.currToken.type}`
                    });
                }
                this.delimiter = this._parser.currToken;
                this._parser.index++;
            } else {
                this.delimiter = this._parser.currToken;
                this._parser.problems.push({
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
        this.text = this._parser.currToken.text;
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
            if (JoinFrom.validJoinTokens.has(this._parser.currToken.text.toUpperCase())) {
                if (this._parser.currToken.text.toUpperCase() === 'JOIN') {
                    this.joinType = 'LEFT';
                } else if (this._parser.currToken.text.toUpperCase() === 'OUTER') {
                    this.joinType = 'LEFT';
                    this._parser.index++;
                } else {
                    if (this._parser.currToken.text.toUpperCase() === 'OUTER') {
                        this._parser.index++;
                        if (!JoinFrom.validJoinTokens.has(this._parser.currToken.text.toUpperCase())) {
                            throw new TokenError(this._parser.currToken, `"${this._parser.currToken.text}" is not a valid JOIN type`);
                        }
                    }
                    this.joinType = this._parser.currToken.text as JoinType;
                    this._parser.index++;
                }

                if (this._parser.currToken.text.toUpperCase() !== 'JOIN') {
                    throw new TokenError(this._parser.currToken, `Expected "JOIN" found ${this._parser.currToken}`);
                }
                this._parser.index++;
                return;
            } else if (['CROSS'].includes(this._parser.currToken.text.toUpperCase())) {
                // TODO: CROSS and NATURAL joins
                throw new Error('CROSS joins are not implemented');
            } else {
                throw new TokenError(this._parser.currToken, 'Unexpected Token: ' + this._parser.currToken.text);
            }
        }
        if (!this.source) {
            const source = table(this._parser);
            this._parser.state.push(source);
            this.source = source;
            return;
        }
        if (!this.condition) {
            switch (this._parser.currToken.text.toUpperCase()) {
                case 'ON':
                    this._parser.index++;
                    this._parser.state.push(new ValueExpressionFactory(this._parser, (b) => this.condition = b));
                    return;
                case 'USING':
                    this._parser.index++;
                    if (this._parser.currToken.type !== LexerType.LParen) {
                        throw new TokenError(this._parser.currToken, `Expected '(', found ${this._parser.currToken.text}`);
                    }
                    this.condition = new JoinColumnList(this._parser);
                    this._parser.state.push(this.condition);
                    this._parser.index++;
                    return;
                default:
                    throw new TokenError(this._parser.currToken, `Expected 'USING' or 'ON' clause, found ${this._parser.currToken.text}`);
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
            const currToken = this._parser.currToken;
            if (IDENTIFIER.has(currToken.type)) {
                if (isRegularIdentifier(currToken)) {
                    if (currToken.isReserved) {
                        tokenError(this._parser, `Invalid alias, '%s' is a reserved keyword`);
                    } else if (currToken.isKeyword) {
                        nextTokenError(this._parser, `'%s' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`, DiagnosticSeverity.Warning);
                    }
                }
                this.columns.push(currToken);
                this._parser.index++;
            }
            if (this._parser.currToken.type === LexerType.Comma) {
                this._parser.index++;
                continue;
            }
            if (this._parser.currToken.type === LexerType.RParen) {
                this._parser.index++;
                break;
            }
            throw new TokenError(this._parser.currToken);
        }
        this.end = this._parser.tokenOffset(-1).end;
        this.text = this._parser.currText.substring(this.start, this.end);
        return this.flush();
    }
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-from
class FromSelect extends BaseState {

    joins: JoinFrom[] = [];

    source?: Table;
    type = ParserType.From;
    parse() {
        if (JoinFrom.validJoinTokens.has(this._parser.currToken.text.toUpperCase())) {
            let newJoin = new JoinFrom(this._parser);
            this._parser.state.push(newJoin);
            this.joins.push(newJoin);
        } else if (this.joins.length || this.source) {
            let lastToken = this._parser.tokenOffset(-1);
            this.end = lastToken.end;
            this.text = this._parser.text.substring(this.start, this.end);
            this.flush();
        } else {
            const source = table(this._parser);
            this._parser.state.push(source);
            this.source = source;
        }
    }

    constructor(parser: Parser) {
        super(parser);
        this._parser.index++;
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
        const token = this._parser.currToken;
        this.start = this._parser.index;
        this.identifier = token;
        this._parser.index++;

        this.parseAlias();

        this.flush();
    }
}

export class DerivedTable extends BaseTable implements State {
    paren?: ExpressionParenthesis;

    type = ParserType.DerivedTable;
    parse() {
        if (this.paren) {
            const lastToken = this._parser.tokenOffset(-1);
            if (lastToken.type === LexerType.RParen) {
                this.end = lastToken.end;
                this.text = this._parser.text.substring(this.start, this.end);
                this.parseAlias();
                this.flush();
            } else {
                nextTokenError(this._parser, `Unknown Token: %s`);
            }
        } else {
            this.paren = new ExpressionParenthesis(this._parser.currToken, this._parser);
            this._parser.state.push(this.paren);
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
            this._parser.state.push(new ValueExpressionFactory(this._parser, (b) => this.condition = b));
            return;
        }
        this.end = this.condition.end;
        this.flush();
    }

    constructor(parser: Parser) {
        super(parser);
        this._parser.index++;
    }
}

export class GroupBy extends BaseState {

    public columns: ValueExpression[] = [];

    public type = ParserType.GroupBy;

    flush(): void {
        this.end = this._parser.tokenOffset(-1).end;
        this.text = this._parser.text.substring(this.start, this.end);
        if (!this.columns.length) {
            this._parser.problems.push({
                start: this.start,
                end: this.end,
                severity: DiagnosticSeverity.Error,
                message: `Empty Group By Expression`
            });
        }
        super.flush();
    }
    parse() {
        const currToken = this._parser.currToken;
        if (currToken.type === LexerType.Comma) {
            if (this.columns.length === 0) {
                this._parser.problems.push({
                    start: this.start,
                    end: currToken.end,
                    severity: DiagnosticSeverity.Error,
                    message: `Unexpected Token: ','`
                });
            }
            this._parser.index++;
            return this._parser.state.push(new ValueExpressionFactory(this._parser, (b) => this.columns.push(b)));
        }
        if (currToken.text.toUpperCase() === 'HAVING') {
            if (this.having) {
                throw new TokenError(currToken, `Duplicate 'HAVING' clause in 'GROUP BY' expression`);
            }
            if (this.columns.length === 0) {
                throw new TokenError(currToken, `Empty 'GROUP BY' clause`);
            }
            const newHaving = new HavingClause(this._parser);
            this._parser.state.push(newHaving);
            return this.having = newHaving;
        }
        if (this.columns.length === 0 && !isEndOfStatement(currToken)) {
            return this._parser.state.push(new ValueExpressionFactory(this._parser, (b) => this.columns.push(b)));
        }
        return this.flush();
    }

    constructor(parser: Parser) {
        super(parser);
        this.start = this._parser.currToken.start;

        this._parser.index++;
        if (this._parser.currToken.text.toUpperCase() !== 'BY') {
            throw new TokenError(this._parser.currToken, `Expected 'BY', found ${this._parser.currToken.text}`);
        }
        this._parser.index++;
    }

    having?: HavingClause;
}

class HavingClause extends BaseState {

    type = ParserType.HavingClause;
    condition?: ValueExpression;
    parse() {
        if (!this.condition) {
            this._parser.state.push(new ValueExpressionFactory(this._parser, (b) => this.condition = b));
            return;
        }
        this.end = this.condition.end;
        this.flush();
    }

    constructor(parser: Parser) {
        super(parser);
        this._parser.index++;
    }
}
