import {DiagnosticSeverity} from 'vscode-languageserver-types';
import {Parser} from '.';
import {BaseState, BaseToken, Token} from './base';
import {SelectStatement} from './select';
import {REGULAR_IDENTIFIER} from './symbols';
import {consumeWhiteSpace, consumeCommentsAndWhitespace, nextTokenError} from './utils';

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
        consumeWhiteSpace(this.parser);
        consumeCommentsAndWhitespace(this.parser);

        if (!this.start) this.start = this.parser.index;

        const currText = this.parser.currText;

        if (currText.startsWith('(')) {
            this.parser.index++;
            this.depth++;
        } else if (currText.startsWith(')')) {
            this.parser.index++;
            this.depth--;
        } else if (this.depth) {
            let nextParenthesis = currText.match(/[()]/);
            if (nextParenthesis == null) {
                this.parser.problems.push({
                    start: this.parser.index,
                    end: this.parser.text.length,
                    message: 'Unclosed Parenthesis'
                })
            }
            this.parser.index += nextParenthesis?.index ?? this.parser.currText.length;
        } else if (/^(;|$|,|from(?=[^\w$]|$)|\))/i.test(currText)){
            this.end = this.parser.index;
            this.text = this.parser.text.substring(this.start, this.end);
            this.flush();
        } else {
            const start = this.parser.index;
            const res = currText.match(new RegExp(`^:?(${REGULAR_IDENTIFIER}|[^,;)\\S]+)`));
            if (res?.[0]) {
                this.parser.index += res?.[0].length;
                this.tokens.push(new BaseToken({start, text: res?.[0], end: this.parser.index}));
            } else {
                this.parser.index++;
            }

        }
    }

    private tokens: Token[] = [];
    private depth: number = 0;
}

// https://firebirdsql.org/file/documentation/html/en/refdocs/fblangref40/firebird-40-language-reference.html#fblangref40-dml-select-column-list
export class OutputColumn extends BaseState {

    public expression?: ValueExpression | IdentifierStar;
    public parent: SelectStatement;

    /*
        <output_column> ::= <qualifier>.*
                          | <value_expression> [COLLATE collation] [[AS] alias]
     */
    parse() {
        consumeWhiteSpace(this.parser);
        consumeCommentsAndWhitespace(this.parser);

        const isFrom = /^from([^\w$]|$)/i.test(this.parser.currText);
        const isComma = this.parser.currText.startsWith(',');
        if (isFrom || isComma || this.parser.index >= this.parser.currText.length) {
            if (isComma) {
                this.parser.index++;
            }
            this.end = this.parser.index;
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
        } else if (IdentifierStar.match.test(this.parser.currText)) {
            this.expression = new IdentifierStar(this.parser);
            this.parser.state.push(this.expression);
        } else {
            this.expression = new ValueExpression(this.parser);
            this.parser.state.push(this.expression);
        }
    }

    constructor(parser: Parser, parent: SelectStatement) {
        super(parser);
        this.start = this.parser.index;
        this.parent = parent;
    }
}

export class IdentifierStar extends BaseState {

    static match = new RegExp(`^${REGULAR_IDENTIFIER}\\.\\*(?=\\)|$|,|;|\\s)`);

    parse() {
        let text = this.parser.currText.match(IdentifierStar.match)?.[0];
        if (text == null) {
            throw new Error('Could not get identifier');
        }
        this.start = this.parser.index;
        this.parser.index += text.length;
        this.end = this.parser.index;
        this.text = text;

        consumeWhiteSpace(this.parser);
        consumeCommentsAndWhitespace(this.parser);
        if (!/^(from(?=[^\w$]|$)|,|\)|$|;)/.test(this.parser.currText)) {
            nextTokenError(this.parser, `Unknown Token`);
        }
        this.flush();
    }
}
