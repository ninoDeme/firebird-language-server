import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseState, Token} from './base';
import {SelectStatement} from './select';
import {IDENTIFIER, TokenType} from './symbols';
import {nextTokenError} from './utils';
import {isEndOfStatement} from './statement';

export class ValueExpression extends BaseState {

    /*
    <value_expression> ::= [<qualifier>.]col_name
                         | [<qualifier>.]selectable_SP_outparm
                         | <literal>
                         | <context-variable>
                         | <function-call> ( <normal_function> | <aggregate_function> | <window_function> )
                         | <single-value-subselect>
                         | <CASE-construct>
                         | any other expression returning a single value of a Firebird data type or NULL
    */

    parse() {
        if (!this.start) this.start = this.parser.index;

        const currToken = this.parser.currToken;

        if (currToken.type === TokenType.LParen) {
            this.parser.index++;
            this.depth++;
            return this.tokens.push(currToken);
        }

        if (currToken.type === TokenType.RParen) {
            this.parser.index++;
            this.depth--;
            return this.tokens.push(currToken);
        }
        if (this.depth) {
            this.parser.index++;
            if (currToken.type === TokenType.EOF || currToken.type === TokenType.DotColon) {
                let lastParens = [...this.tokens].reverse().find(item => item.text === '(');
                this.parser.problems.push({
                    start: lastParens?.start || this.start,
                    end: currToken.end,
                    message: 'Unclosed Parenthesis'
                });
                this.flush();
            }
            return;
        }
        if (isEndOfStatement(currToken) || currToken.text.toUpperCase() === 'FROM' || currToken.type === TokenType.Comma) {
            this.end = this.tokens[this.tokens.length - 1].end;
            this.text = this.parser.text.substring(this.start, this.end);
            return this.flush();
        }
        this.parser.index++;
        return this.tokens.push(currToken);
    }

    public tokens: Token[] = [];
    private depth: number = 0;
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-column-list
export class OutputColumn extends BaseState {

    public expression?: ValueExpression | IdentifierStar;
    public parent: SelectStatement;
    public alias?: Token;
    public collation?: Token;

    /*
        <output_column> ::= <qualifier>.*
                          | <value_expression> [COLLATE collation] [[AS] alias]
     */
    parse() {
        const currToken = this.parser.currToken;
        let isComma = currToken.type === TokenType.Comma;
        if (isEndOfStatement(currToken) || currToken.text.toUpperCase() === 'FROM' || isComma) {

            if (isComma) {
                this.parser.index++;
            }
            this.end = this.parser.tokenOffset(-1).end;
            this.text = this.parser.text.substring(this.start, this.end);
            if (!this.expression) {
                this.parser.problems.push({
                    start: this.start,
                    end: this.end,
                    severity: DiagnosticSeverity.Error,
                    message: `Empty Column Expression`
                });
            }
            this.flush();
            if (isComma) {
                this.parent.addNewColumn();
            }
        } else if (this.expression) {
            throw new Error('Unimplemented probably ');
        } else if (IDENTIFIER.has(currToken.type) && this.parser.tokenOffset(1).type === TokenType.Dot && this.parser.tokenOffset(2).type === TokenType.Asterisk) {
            this.expression = new IdentifierStar(this.parser);
            this.parser.state.push(this.expression);
        } else {
            this.expression = new ValueExpression(this.parser);
            this.parser.state.push(this.expression);
        }
    }

    constructor(parser: Parser, parent: SelectStatement) {
        super(parser);
        this.start = this.parser.currToken.start;
        this.parent = parent;
    }
}

export class IdentifierStar extends BaseState {

    identifier!: Token;
    dot!: Token;
    asterisk!: Token;
    parse() {
        this.identifier = this.parser.currToken;
        this.parser.index++;
        this.start = this.identifier.start;
        this.dot = this.parser.currToken;

        this.parser.index++;
        let next = this.parser.currToken;
        if (next.type === TokenType.Asterisk) {
            this.asterisk = next;
            this.end = next.end;
            this.text = this.parser.currText.substring(this.start, this.end);
            this.parser.index++;
        } else {
            nextTokenError(this.parser, `Expected asterisk found ${next.text}`);
        }
        this.flush();
    }
}
