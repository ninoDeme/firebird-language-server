import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseState, BaseToken, State, Token} from './base';
import {SelectStatement} from './select';
import {IDENTIFIER, LITERAL, LexerType, getOperator, ParserType} from './symbols';
import {nextTokenError} from './utils';
import {isEndOfStatement} from './statement';
import {ExpressionParenthesis, ParenthesisBody} from './paren';
import {LexedRegularIdentifier} from './lexer';
import {ParserTimeDate} from './literals';

export interface ValueExpression extends Token, ParenthesisBody {};
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
export class ValueExpressionFactory implements ParenthesisBody, State {
    insideParenthesis: boolean = false;
    private elements?: Token[] = [];
    body?: ValueExpression;
    type = ParserType.ValueExpression

    processed: boolean = false;
    parse() {
        if (!this.processed) {
            return this.preprocess();
        }
        if (this.body) {
            return this.flush();
        }
        if (!this.elements) throw new Error("Elements doesnt exist?");
        let highestPrecedenceIndex: undefined | number = undefined;
        let highestPrecedence: number = 0;
        for (let i in this.elements) {
            let currElement = this.elements[i];
            if (currElement instanceof Operator && currElement.precedence > highestPrecedence) {
                highestPrecedenceIndex = Number(i);
                highestPrecedence = currElement.precedence;
            }
        }
        if (highestPrecedenceIndex != null) {
            let operator = this.elements[highestPrecedenceIndex] as Operator;

            this._parser.state.push(operator);
            let left = new ValueExpressionFactory(this._parser, (b) => operator.left = b, this.elements.slice(0, highestPrecedenceIndex));
            if (left.elements!.length === 0) {
                if (!operator.unary) {
                    this._parser.problems.push({
                        start: operator.end,
                        end: operator.end,
                        message: "Expected Expression, found nothing"
                    });
                    operator.left = new EmptyExpression(operator.end);
                }
            } else {
                this._parser.state.push(left);
            }

            let right = new ValueExpressionFactory(this._parser, (b) => operator.right = b, this.elements.slice(highestPrecedenceIndex + 1));
            if (right.elements!.length === 0) {
                if (!operator.unary) {
                    this._parser.problems.push({
                        start: operator.end,
                        end: operator.end,
                        message: "Expected Expression, found nothing"
                    });
                    operator.right = new EmptyExpression(operator.end);
                }
            } else {
                this._parser.state.push(right);
            }
            this.elements = [operator];
        }
        if (this.elements.length !== 1) {
            throw new Error("Expected a single element in valueExpression, found " + this.elements.length);
        }
        this.body = this.elements[0] as ValueExpression;
    }

    flush() {
        if (!this.body) {
            throw new Error("Body is empty?");
        }
        this._parser.state.splice(this._parser.state.findIndex(el => el === this), 1);
        delete this.elements;
        this.callback(this.body);
    }
    preprocess() {
        if (!this.elements) throw new Error("Elements doesn't exist?");
        let currToken = this._parser.currToken;
        let lastOperator = !this.elements.length || (this.elements[this.elements.length - 1] instanceof Operator);
        if (currToken.type === LexerType.LParen) {
            let parens = new ExpressionParenthesis(currToken, this._parser);
            this.elements.push(parens);
            this._parser.state.push(parens);
            return;
        }
        if (currToken.type === LexerType.RParen || isEndOfStatement(currToken) || currToken.type === LexerType.Comma) {
            if (lastOperator) {
                this._parser.problems.push({
                    start: currToken.start,
                    end: currToken.end,
                    message: `Expected expression, found: '${currToken.text}'`
                });
            }
            this.processed = true;
            return;
        }
        let predicate = getOperator(this._parser);
        if (predicate) {
            let newOperator = new Operator(predicate.token, predicate.precedence, this._parser);
            this.elements.push(newOperator);
            if (lastOperator && newOperator.symbol.text !== '+' && newOperator.symbol.text !== '-') {
                this._parser.problems.push({
                    start: currToken.start,
                    end: currToken.end,
                    message: `Expected expression, found: '${currToken.text}'`
                });
                this.elements.push(new EmptyExpression(currToken.start));
            } else if (lastOperator) {
                newOperator.unary = true;
                newOperator.precedence = 1;
            }
            return;
        }
        if (!lastOperator) {
            this.processed = true;
            return;
        }
        if (IDENTIFIER.has(currToken.type)) {
            this._parser.index += 1;
            let nextToken = this._parser.currToken;
            if (nextToken.type === LexerType.LParen) {
                let newFunction = new ParserFunction(currToken, this._parser);
                this.elements.push(newFunction);
                this._parser.state.push(newFunction);
                return;
            }
            if (nextToken.type === LexerType.Dot) {
                let newFunction = new TableDereference(currToken, this._parser);
                this.elements.push(newFunction);
                return;
            }
            if (['DATE', 'TIMESTAMP', 'TIME'].includes(currToken.text.toUpperCase())) {
                let newFunction = new ParserTimeDate(this._parser);
                this.elements.push(newFunction);
                return;
            }
            this.elements.push(currToken);
            return;
        }
        if (currToken.type === LexerType.Variable) {
            this.elements.push(currToken);
            return;
        }
        if (LITERAL.has(currToken.type)) {
            // TODO: Literal
            this._parser.index++;
            this.elements.push(currToken);
        }
    }

    constructor(public _parser: Parser, public callback: (body: ValueExpression) => void, elements?: Token[]) {
        if (elements?.length) {
            this.elements = elements;
            this.processed = true;
        }
    }
}

export class EmptyExpression implements Token {
    type = ParserType.EmptyExpression;
    text = "";
    start: number;
    end: number;
    constructor(cursor: number) {
        this.start = cursor;
        this.end = cursor
    }
}

export class Operator implements Token, State {
    left?: Token;
    right?: Token;
    precedence: number = 99; // precedence = <type-precedence><operator-precedence>
    symbol: Token;
    unary?: boolean;
    type = LexerType.Operator

    constructor(token: Token, precedence: number, parser: Parser) {
        this._parser = parser;
        this.precedence = precedence;
        this.symbol = token;
    }
    _parser: Parser;
    parse() {
        this.flush();
    };
    flush() {
        this._parser.state.splice(this._parser.state.findIndex(el => el === this), 1);
        this.end = this.right?.end ?? this.symbol.end;
        this.start = this.left?.start ?? this.symbol.start;
        this.text = this._parser.text.substring(this.start, this.end);
    };
    text!: string;
    start!: number;
    end!: number;
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-column-list
export class OutputColumn extends BaseState {

    public expression?: ValueExpression | IdentifierStar;
    public _parent: SelectStatement;
    public alias?: Token;
    public collation?: Token;

    public type = ParserType.OutputColumn

    flush(): void {
        let isComma = this._parser.currToken.type === LexerType.Comma;
        if (isComma) {
            this._parser.index++;
        }
        this.end = this._parser.tokenOffset(-1).end;
        this.text = this._parser.text.substring(this.start, this.end);
        if (!this.expression) {
            this._parser.problems.push({
                start: this.start,
                end: this.end,
                severity: DiagnosticSeverity.Error,
                message: `Empty Column Expression`
            });
        }
        super.flush();
        if (isComma) {
            this._parent.addNewColumn();
        }
    }
    /*
        <output_column> ::= <qualifier>.*
                          | <value_expression> [COLLATE collation] [[AS] alias]
     */
    parse() {
        const currToken = this._parser.currToken;
        if (isEndOfStatement(currToken) || currToken.text.toUpperCase() === 'FROM' || currToken.type === LexerType.Comma) {
            this.flush();
        } else if (this.expression) {
            if (currToken.text.toUpperCase() === 'COLLATE') {
                throw new Error('Implement Collate');
            }
            this.parseAlias();
            this.flush();
        } else if (IDENTIFIER.has(currToken.type) && this._parser.tokenOffset(1).type === LexerType.Dot && this._parser.tokenOffset(2).type === LexerType.Asterisk) {
            this.expression = new IdentifierStar(this._parser);
            this._parser.state.push(this.expression as IdentifierStar);
        } else {
            this._parser.state.push(new ValueExpressionFactory(this._parser, (b) => this.expression = b));
        }
    }

    parseAlias() {
        let hasAS = false;
        if (this._parser.currToken.text.toUpperCase() === 'AS') {
            this._parser.index++;
            hasAS = true;
        }

        const token = this._parser.currToken;

        if (IDENTIFIER.has(token.type) && !(token as LexedRegularIdentifier).isReserved) {
            if ((token as LexedRegularIdentifier).isKeyword) {
                this._parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `'${token.text}' is a keyword and may become reserved in the future, consider changing it, or surrounding it with double quotes`,
                    severity: DiagnosticSeverity.Warning
                });
            }
            this.alias = token;
            this._parser.index++;
        } else if (hasAS) {
            if ((token as LexedRegularIdentifier).isReserved) {
                this._parser.problems.push({
                    start: token.start,
                    end: token.end,
                    message: `Invalid alias, '${token.text}' is a reserved keyword`
                });
                this.alias = token;
                this._parser.index++;
            } else {
                this._parser.problems.push({
                    start: this._parser.index,
                    end: this._parser.index,
                    message: `Missing or invalid Alias`
                });
            }
        }
    }

    constructor(parser: Parser, parent: SelectStatement) {
        super(parser);
        this.start = this._parser.currToken.start;
        this._parent = parent;
    }
}

export class IdentifierStar extends BaseState {

    identifier!: Token;
    dot!: Token;
    asterisk!: Token;

    type = ParserType.IdentifierStar
    parse() {
        this.identifier = this._parser.currToken;
        this._parser.index++;
        this.start = this.identifier.start;
        this.dot = this._parser.currToken;

        this._parser.index++;
        let next = this._parser.currToken;
        if (next.type === LexerType.Asterisk) {
            this.asterisk = next;
            this.end = next.end;
            this.text = this._parser.currText.substring(this.start, this.end);
            this._parser.index++;
        } else {
            nextTokenError(this._parser, `Expected asterisk found %s`);
        }
        this.flush();
    }
}

export class ParserFunction implements State, Token {
    text!: string;
    start!: number;
    end!: number;
    head: Token;
    type = ParserType.ParserFunction

    _parser: Parser;
    parse() {
        if (this._parser.currToken.type === LexerType.RParen) {
            this._parser.index++;
            return this.flush();
        }
        if (this._parser.currToken.type === LexerType.EOF || this._parser.currToken.type === LexerType.DotColon) {
            this._parser.problems.push({
                start: this.start,
                end: this._parser.currToken.end,
                message: `Unterminated Parenthesis`
            });
            return this.flush();
        }
        const currToken = this._parser.currToken;
        if (currToken.type === LexerType.Comma) {
            this._parser.index++;
            let newExpression = new ValueExpressionFactory(this._parser, (b) => this.body.push(b));
            newExpression.insideParenthesis = true;
            this._parser.state.push(newExpression);
            return;
        }
        if (this.body?.[0]) {
            this._parser.problems.push({
                start: currToken.start,
                end: currToken.end,
                message: `Unknown Token: '${currToken.text}'`
            });
            return this._parser.index++;
        }
        let newExpression = new ValueExpressionFactory(this._parser, (b) => this.body.push(b));
        newExpression.insideParenthesis = true;
        this._parser.state.push(newExpression);
    };

    body: ValueExpression[] = [];
    flush = () => {
        this.end = this._parser.currToken.end;
        this.text = this._parser.text.substring(this.start, this.end);
        this._parser.state.splice(this._parser.state.findIndex(el => el === this, 1));
    };

    constructor(token: Token, parser: Parser) {
        this.start = token.start;
        this._parser = parser;
        this.head = token;
        this._parser.index++;
    }
}

export class TableDereference implements BaseToken {
    left: Token;
    right?: Token;
    type = ParserType.TableDereference;
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
                    message: `Invalid identifier, '${token.text}' is a reserved keyword`
                });
            }
            this.right = currToken;
            parser.index++;
        } else {
            parser.problems.push({
                start: token.start,
                end: token.end,
                message: `Token '${token.text}' is an invalid identifier`
            });
        }
        let lastToken = parser.tokenOffset(-1);
        this.end = lastToken.end;
        this.text = parser.text.substring(this.start, this.end);
    }
}
