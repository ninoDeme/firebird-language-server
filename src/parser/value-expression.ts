import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseState, BaseToken, State, Token} from './base';
import {SelectStatement} from './select';
import {IDENTIFIER, LITERAL, OPERATORS, REGULAR_IDENTIFIER, TokenType} from './symbols';
import {nextTokenError} from './utils';
import {isEndOfStatement} from './statement';
import {ExpressionParenthesis, ParenthesisBody} from './paren';
import {LexedRegularIdentifier, LexedToken} from './lexer';
import {BaseTimeDate} from './literals';

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
export class ValueExpression extends BaseState implements ParenthesisBody {
    insideParenthesis: boolean = false;
    elements: Token[] = [];
    parse() {
        let currToken = this.parser.currToken;
        if (currToken.type === TokenType.LParen) {
            this.parser.index += 1;
            let parens = new ExpressionParenthesis(currToken, this.parser);
            this.elements.push(parens)
            this.parser.state.push(parens)
            return;
        }
        if (currToken.type === TokenType.RParen) {
            return this.flush();
        }
        if (isEndOfStatement(currToken, this.insideParenthesis) || currToken.text.toUpperCase() === 'FROM' || currToken.type === TokenType.Comma) {
            return this.flush();
        }
        if (currToken.type === TokenType.Operator || OPERATORS.has(currToken.text.toUpperCase())) {
            this.elements.push(currToken)
        }
        if (IDENTIFIER.has(currToken.type)) {
            this.parser.index += 1;
            let nextToken = this.parser.currToken;
            if (nextToken.type === TokenType.LParen) {
                let newFunction = new ParserFunction(currToken, this.parser);
                this.elements.push(newFunction);
                this.parser.state.push(newFunction);
                return;
            } else if (nextToken.type === TokenType.Dot) {
                let newFunction = new TableDereference(currToken, this.parser);
                this.elements.push(newFunction);
                return;
            } else if (['DATE', 'TIMESTAMP', 'TIME'].includes(currToken.text.toUpperCase())) {
                let newFunction = new BaseTimeDate(this.parser);
                this.elements.push(newFunction);
                return;
            } else {
                this.elements.push(currToken);
            }
            return;
        }
        if (currToken.type === TokenType.Variable) {
            this.elements.push(currToken)
        }
        if (LITERAL.has(currToken.type)) {
            // TODO: Literal
            this.elements.push(currToken);
        }
    }
}

export class Operator extends BaseState {
    left?: Token;
    right?: Token;
    precedence: number = 99; // precedence = <type-precedence><operator-precedence>
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
            if (currToken.text.toUpperCase() === 'COLLATE') {
                throw new Error('Implement Collate');
            }
            if (IDENTIFIER.has(currToken.type)) {
                return this.parseAlias();
            }
        } else if (IDENTIFIER.has(currToken.type) && this.parser.tokenOffset(1).type === TokenType.Dot && this.parser.tokenOffset(2).type === TokenType.Asterisk) {
            this.expression = new IdentifierStar(this.parser);
            this.parser.state.push(this.expression);
        } else {
            this.expression = new ValueExpression(this.parser);
            this.parser.state.push(this.expression);
        }
    }

    parseAlias() {
        let hasAS = false;
        if (this.parser.currToken.text.toUpperCase() === 'AS') {
            this.parser.index++;
            hasAS = true;
        }

        const token = this.parser.currToken;

        if (IDENTIFIER.has(token.type) && !(token as LexedRegularIdentifier).isReserved) {
            if ((token as LexedRegularIdentifier).isKeyword) {
                this.parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `'${token.text}' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`,
                    severity: DiagnosticSeverity.Warning
                });
            }
            this.alias = token;
            this.parser.index++;
        } else if (hasAS) {
            if ((token as LexedRegularIdentifier).isReserved) {
                this.parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `Invalid alias, '${token}' is a reserved keyword`
                });
                this.alias = token;
                this.parser.index++;
            } else {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: this.parser.index,
                    message: `Missing or invalid Alias`
                });
            }
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

export class ParserFunction implements State, Token {
    text!: string;
    start!: number;
    end!: number;
    head: Token

    parser: Parser;
    parse() {
        if (this.parser.currToken.type === TokenType.RParen) {
            this.parser.index++;
            return this.flush();
        }
        if (this.parser.currToken.type === TokenType.EOF || this.parser.currToken.type === TokenType.DotColon) {
            this.parser.problems.push({
                start: this.start,
                end: this.parser.currToken.end,
                message: `Unterminated Parenthesis`
            });
            return this.flush();
        }
        const currToken = this.parser.currToken;
        if (currToken.type === TokenType.Comma) {
            this.parser.index++;
            let newExpression = new ValueExpression(this.parser)
            newExpression.insideParenthesis = true;
            this.body?.push(newExpression);
            this.parser.state.push(newExpression);
            return;
        }
        if (this.body?.[0]) {
            this.parser.problems.push({
                start: currToken.start,
                end: currToken.end,
                message: `Unknown Token: '${currToken.text}'`
            });
            return this.parser.index++
        } 
        let newExpression = new ValueExpression(this.parser)
        newExpression.insideParenthesis = true;
        this.body?.push(newExpression);
        this.parser.state.push(newExpression);
    };

    body: ValueExpression[] = [];
    flush = () => {
        this.end = this.parser.currToken.end;
        this.text = this.parser.text.substring(this.start, this.end);
        this.parser.state.splice(this.parser.state.findIndex(el => el === this, 1));
    };

    constructor(token: Token, parser: Parser) {
        this.start = token.start;
        this.parser = parser;
        this.head = token;
        this.parser.index++;
    }
}

export class TableDereference implements BaseToken {
    left: Token;
    right?: Token;

    text: string;
    start: number;
    end: number;
    constructor(token: Token, parser: Parser) {
        this.start = token.start;
        this.left = token;
        parser.index++;
        if (IDENTIFIER.has(parser.currToken.type)) {
            let currToken = parser.currToken as LexedRegularIdentifier;
            if (currToken.isReserved) {
                parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `'${token.text}' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`,
                    severity: DiagnosticSeverity.Warning
                });
            } else if (currToken.isKeyword) {
                parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `Invalid identifier, '${token}' is a reserved keyword`
                });
            }
            this.right = currToken;
            parser.index++
        } else {
            parser.problems.push({
                start: token.start,
                end: token.end,
                message: `Token '${token}' is an invalid identifier`
            });
        }
        let lastToken = parser.tokenOffset(-1);
        this.end = lastToken.end;
        this.text = parser.text.substring(this.start, this.end);
    }
}