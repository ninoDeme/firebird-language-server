import {Parser} from '.';
import {Token} from './base';

export const REGULAR_IDENTIFIER = '([A-z][\\w$]*)';
export const NON_REGULAR_IDENTIFIER = '"((?:[^"]|"")*(?:[^ "]|""))? *(?:"|($))';

export const REGULAR_IDENTIFIER_REGEX = /^([A-z][\w$]*)/;
export const NON_REGULAR_IDENTIFIER_REGEX = /^"((?:[^"]|"")*(?:[^ "]|""))? *(?:"|($))/;

export const VARIABLE_REGEX = new RegExp(`^:(${REGULAR_IDENTIFIER}|${NON_REGULAR_IDENTIFIER})`);

export const SPECIAL_CHARACTERS = new Set([
    '"',
    '%',
    '&',
    '\'',
    '(',
    ')',
    '*',
    '+',
    ',',
    '-',
    '.',
    '/',
    ':',
    ';',
    '<',
    '=',
    '>',
    '?',
    '[',
    ']',
    '^',
    '{',
    '}'
]);

export const SPECIAL_CHARACTERS_REGEX = /^[\\"%&'()*+,\-.\/:;<=>?\[\]\^{}]/;
export const SPECIAL_CHARACTERS_REGEX2 = `^[\\\\"%&'()*+,\\-.\\/:;<=>?\\[\\]\\^{}]`;

export const ARITHMETIC_OPERATORS = [
    '+',
    '-',
    '/',
    '*'
];

export const CONCATENATION_OPERATORS = [
    '||'
];

export const COMPARISON_OPERATORS = [
    'IS',
    '<>',
    '!=',
    '~=',
    '^=',
    '>=',
    '<=',
    '!>',
    '~>',
    '^>',
    '!<',
    '~<',
    '^<',
    '>',
    '<',
    '=',
];

export const LOGICAL_OPERATORS = [
    'NOT',
    'AND',
    'OR'
];

export const OPERATORS_PRECEDENCES: Record<string, number> = {
    '||': 11,
    '+': 23,
    '-': 23,
    '/': 22,
    '*': 22,
    'IS': 31,
    '<>': 32,
    '!=': 32,
    '~=': 32,
    '^=': 32,
    '>=': 32,
    '<=': 32,
    '!>': 32,
    '~>': 32,
    '^>': 32,
    '!<': 32,
    '~<': 32,
    '^<': 32,
    '>': 32,
    '<': 32,
    '=': 32,
    'BETWEEN': 32,
    'LIKE': 32,
    'CONTAINING': 32,
    'SIMILAR': 32,
    'STARTING': 32,
    'NOT': 41,
    'AND': 42,
    'OR': 43
};

export const UNARY = new Set([
    '+',
    '-',
    // 'IS'
])

export const OPERATORS = new Set([...ARITHMETIC_OPERATORS, ...COMPARISON_OPERATORS, ...CONCATENATION_OPERATORS, ...LOGICAL_OPERATORS].sort((a, b) => b.length - a.length));
export const OPERATORS_REGEX = /^(<[>=]?|>=?|[!~^][<>=]|\|\||[-+*\/=])/;

export const enum LexerType {
    RegularIdentifier = "RegularIdentifier",
    WhiteSpace = "WhiteSpace",
    Comment = "Comment",
    EOF = "EOF",
    Variable = "Variable",
    NonRegularIdentifier = "NonRegularIdentifier",
    Operator = "Operator",
    Introducer = "Introducer",
    String = "String",
    Integer = "Integer",
    FixedPoint = "FixedPoint",
    FloatingPoint = "FloatingPoint",
    SpecialCharacter = "SpecialCharacter",
    RParen = "RParen",
    LParen = "LParen",
    DotColon = "DotColon",
    Asterisk = "Asterisk",
    Comma = "Comma",
    Dot = "Dot",
}
































































































































export const enum ParserType {
    SelectStar = "SelectStar",
    Parenthesis = "Parenthesis",
    ExpressionParenthesis = "ExpressionParenthesis",
    ParserString = "ParserString",
    ParserTimeDate = "ParserTimeDate",
    TableDereference = "TableDereference",
    ParserFunction = "ParserFunction",
    ValueExpression = "ValueExpression",
    OutputColumn = "OutputColumn",
    IdentifierStar = "IdentifierStar",
    UnknownStatement = "UnknownStatement",
    EmptyStatement = "EmptyStatement",
    Where = "Where",
    Procedure = "Procedure",
    DerivedTable = "DerivedTable",
    UnknownTable = "UnknownTable",
    SelectStatement = "SelectStatement",
    Table = "Table",
    From = "From",
    JoinColumnList = "JoinColumnList",
    Join = "Join",
    Skip = "Skip",
    First = "First"
}

export type TokenType = ParserType | LexerType;

export const IDENTIFIER = new Set<TokenType>([LexerType.RegularIdentifier, LexerType.NonRegularIdentifier])
export const LITERAL = new Set<TokenType>([LexerType.Integer, LexerType.FloatingPoint, LexerType.FixedPoint, LexerType.String])

export const COMPARISON_PREDICATES_1 = new Set(['LIKE', 'CONTAINING', 'BETWEEN'])

// STARTING WITH,
// SIMILAR TO,
// IS [NOT] NULL,
// IS [NOT] {TRUE | FALSE | UNKNOWN},
// IS [NOT] DISTINCT FROM

export function getOperator(parser: Parser): {token: Token, precedence: number} | undefined {
 
    let firstWord = parser.currToken.text.toUpperCase();
    let start = parser.currToken.start;
    let token: Token | undefined = undefined

    if (firstWord === 'IS') {
        parser.index++;
        if (parser.currToken.text.toUpperCase() === 'NOT') {
            parser.index++;
        }
        if (parser.currToken.text.toUpperCase() === 'DISTINCT') {
            parser.index++;
            if (parser.currToken.text.toUpperCase() !== 'FROM') {
                parser.problems.push({
                    start: parser.currToken.start,
                    end: parser.currToken.end,
                    message: `Expected 'FROM' in 'IS [NOT] DISTINCT FROM' predicate, found: ${parser.currToken.text}`
                })
                parser.index--;
            }       
        }
        token = {
            type: LexerType.Operator,
            start,
            end: parser.currToken.end,
            text: parser.text.substring(start, parser.currToken.end)
        };
        parser.index++;
    }
    if (OPERATORS.has(firstWord) || COMPARISON_PREDICATES_1.has(firstWord)) {
        token = parser.currToken;
        parser.index++;
    }

    if (firstWord === 'STARTING') {
        parser.index++;
        if (parser.currToken.text.toUpperCase() !== 'WITH') {
            parser.problems.push({
                start: parser.currToken.start,
                end: parser.currToken.end,
                message: `Expected 'WITH' in 'STARTING WITH' predicate, found: ${parser.currToken.text}`
            })
            parser.index--;
        }
        token = {
            type: LexerType.RegularIdentifier,
            start,
            end: parser.currToken.end,
            text: parser.text.substring(start, parser.currToken.end)
        };
        parser.index++;
    }
    if (firstWord === 'SIMILAR') {
        parser.index++;
        if (parser.currToken.text.toUpperCase() !== 'TO') {
            parser.problems.push({
                start: parser.currToken.start,
                end: parser.currToken.end,
                message: `Expected 'TO' in 'SIMILAR TO' predicate, found: ${parser.currToken.text}`
            })
            parser.index--;
        }
        token = {
            type: LexerType.Operator,
            start,
            end: parser.currToken.end,
            text: parser.text.substring(start, parser.currToken.end)
        };
        parser.index++;
    }
    let precedence: number = 99
    let unary: boolean = false
    if (token) {
        precedence = OPERATORS_PRECEDENCES[firstWord] ?? 99;
        unary = UNARY.has(firstWord);
    }
    return token ? {token, precedence}: undefined;
}

export const RESERVED_WORDS = new Set([
    'ADD',
    'ADMIN',
    'ALL',
    'ALTER',
    'AND',
    'ANY',
    'AS',
    'AT',
    'AVG',
    'BEGIN',
    'BETWEEN',
    'BIGINT',
    'BINARY',
    'BIT_LENGTH',
    'BLOB',
    'BOOLEAN',
    'BOTH',
    'BY',
    'CASE',
    'CAST',
    'CHAR',
    'CHARACTER',
    'CHARACTER_LENGTH',
    'CHAR_LENGTH',
    'CHECK',
    'CLOSE',
    'COLLATE',
    'COLUMN',
    'COMMENT',
    'COMMIT',
    'CONNECT',
    'CONSTRAINT',
    'CORR',
    'COUNT',
    'COVAR_POP',
    'COVAR_SAMP',
    'CREATE',
    'CROSS',
    'CURRENT',
    'CURRENT_CONNECTION',
    'CURRENT_DATE',
    'CURRENT_ROLE',
    'CURRENT_TIME',
    'CURRENT_TIMESTAMP',
    'CURRENT_TRANSACTION',
    'CURRENT_USER',
    'CURSOR',
    'DATE',
    'DAY',
    'DEC',
    'DECFLOAT',
    'DECIMAL',
    'DECLARE',
    'DEFAULT',
    'DELETE',
    'DELETING',
    'DETERMINISTIC',
    'DISCONNECT',
    'DISTINCT',
    'DOUBLE',
    'DROP',
    'ELSE',
    'END',
    'ESCAPE',
    'EXECUTE',
    'EXISTS',
    'EXTERNAL',
    'EXTRACT',
    'FALSE',
    'FETCH',
    'FILTER',
    'FLOAT',
    'FOR',
    'FOREIGN',
    'FROM',
    'FULL',
    'FUNCTION',
    'GDSCODE',
    'GLOBAL',
    'GRANT',
    'GROUP',
    'HAVING',
    'HOUR',
    'IN',
    'INDEX',
    'INNER',
    'INSENSITIVE',
    'INSERT',
    'INSERTING',
    'INT',
    'INT128',
    'INTEGER',
    'INTO',
    'IS',
    'JOIN',
    'LATERAL',
    'LEADING',
    'LEFT',
    'LIKE',
    'LOCAL',
    'LOCALTIME',
    'LOCALTIMESTAMP',
    'LONG',
    'LOWER',
    'MAX',
    'MERGE',
    'MIN',
    'MINUTE',
    'MONTH',
    'NATIONAL',
    'NATURAL',
    'NCHAR',
    'NO',
    'NOT',
    'NULL',
    'NUMERIC',
    'OCTET_LENGTH',
    'OF',
    'OFFSET',
    'ON',
    'ONLY',
    'OPEN',
    'OR',
    'ORDER',
    'OUTER',
    'OVER',
    'PARAMETER',
    'PLAN',
    'POSITION',
    'POST_EVENT',
    'PRECISION',
    'PRIMARY',
    'PROCEDURE',
    'PUBLICATION',
    'RDB$DB_KEY',
    'RDB$ERROR',
    'RDB$GET_CONTEXT',
    'RDB$GET_TRANSACTION_CN',
    'RDB$RECORD_VERSION',
    'RDB$ROLE_IN_USE',
    'RDB$SET_CONTEXT',
    'RDB$SYSTEM_PRIVILEGE',
    'REAL',
    'RECORD_VERSION',
    'RECREATE',
    'RECURSIVE',
    'REFERENCES',
    'REGR_AVGX',
    'REGR_AVGY',
    'REGR_COUNT',
    'REGR_INTERCEPT',
    'REGR_R2',
    'REGR_SLOPE',
    'REGR_SXX',
    'REGR_SXY',
    'REGR_SYY',
    'RELEASE',
    'RESETTING',
    'RETURN',
    'RETURNING_VALUES',
    'RETURNS',
    'REVOKE',
    'RIGHT',
    'ROLLBACK',
    'ROW',
    'ROWS',
    'ROW_COUNT',
    'SAVEPOINT',
    'SCROLL',
    'SECOND',
    'SELECT',
    'SENSITIVE',
    'SET',
    'SIMILAR',
    'SMALLINT',
    'SOME',
    'SQLCODE',
    'SQLSTATE',
    'START',
    'STDDEV_POP',
    'STDDEV_SAMP',
    'SUM',
    'TABLE',
    'THEN',
    'TIME',
    'TIMESTAMP',
    'TIMEZONE_HOUR',
    'TIMEZONE_MINUTE',
    'TO',
    'TRAILING',
    'TRIGGER',
    'TRIM',
    'TRUE',
    'UNBOUNDED',
    'UNION',
    'UNIQUE',
    'UNKNOWN',
    'UPDATE',
    'UPDATING',
    'UPPER',
    'USER',
    'USING',
    'VALUE',
    'VALUES',
    'VARBINARY',
    'VARCHAR',
    'VARIABLE',
    'VARYING',
    'VAR_POP',
    'VAR_SAMP',
    'VIEW',
    'WHEN',
    'WHERE',
    'WHILE',
    'WINDOW',
    'WITH',
    'WITHOUT',
    'YEAR',
]);

export const KEYWORDS = new Set([
    '!<',
    '^<',
    '^=',
    '^>',
    ',',
    ':=',
    '!=',
    '!>',
    '(',
    ')',
    '<',
    '⇐',
    '<>',
    '=',
    '>',
    '>=',
    '||',
    '~<',
    '~=',
    '~>',
    'ABS',
    'ABSOLUTE',
    'ACCENT',
    'ACOS',
    'ACOSH',
    'ACTION',
    'ACTIVE',
    'ADD',
    'ADMIN',
    'AFTER',
    'ALL',
    'ALTER',
    'ALWAYS',
    'AND',
    'ANY',
    'AS',
    'ASC',
    'ASCENDING',
    'ASCII_CHAR',
    'ASCII_VAL',
    'ASIN',
    'ASINH',
    'AT',
    'ATAN',
    'ATAN2',
    'ATANH',
    'AUTO',
    'AUTONOMOUS',
    'AVG',
    'BACKUP',
    'BASE64_DECODE',
    'BASE64_ENCODE',
    'BEFORE',
    'BEGIN',
    'BETWEEN',
    'BIGINT',
    'BINARY',
    'BIND',
    'BIN_AND',
    'BIN_NOT',
    'BIN_OR',
    'BIN_SHL',
    'BIN_SHR',
    'BIN_XOR',
    'BIT_LENGTH',
    'BLOB',
    'BLOCK',
    'BODY',
    'BOOLEAN',
    'BOTH',
    'BREAK',
    'BY',
    'CALLER',
    'CASCADE',
    'CASE',
    'CAST',
    'CEIL',
    'CEILING',
    'CHAR',
    'CHARACTER',
    'CHARACTER_LENGTH',
    'CHAR_LENGTH',
    'CHAR_TO_UUID',
    'CHECK',
    'CLEAR',
    'CLOSE',
    'COALESCE',
    'COLLATE',
    'COLLATION',
    'COLUMN',
    'COMMENT',
    'COMMIT',
    'COMMITTED',
    'COMMON',
    'COMPARE_DECFLOAT',
    'COMPUTED',
    'CONDITIONAL',
    'CONNECT',
    'CONNECTIONS',
    'CONSISTENCY',
    'CONSTRAINT',
    'CONTAINING',
    'CONTINUE',
    'CORR',
    'COS',
    'COSH',
    'COT',
    'COUNT',
    'COUNTER',
    'COVAR_POP',
    'COVAR_SAMP',
    'CREATE',
    'CROSS',
    'CRYPT_HASH',
    'CSTRING',
    'CTR_BIG_ENDIAN',
    'CTR_LENGTH',
    'CTR_LITTLE_ENDIAN',
    'CUME_DIST',
    'CURRENT',
    'CURRENT_CONNECTION',
    'CURRENT_DATE',
    'CURRENT_ROLE',
    'CURRENT_TIME',
    'CURRENT_TIMESTAMP',
    'CURRENT_TRANSACTION',
    'CURRENT_USER',
    'CURSOR',
    'DATA',
    'DATABASE',
    'DATE',
    'DATEADD',
    'DATEDIFF',
    'DAY',
    'DDL',
    'DEBUG',
    'DEC',
    'DECFLOAT',
    'DECIMAL',
    'DECLARE',
    'DECODE',
    'DECRYPT',
    'DEFAULT',
    'DEFINER',
    'DELETE',
    'DELETING',
    'DENSE_RANK',
    'DESC',
    'DESCENDING',
    'DESCRIPTOR',
    'DETERMINISTIC',
    'DIFFERENCE',
    'DISABLE',
    'DISCONNECT',
    'DISTINCT',
    'DO',
    'DOMAIN',
    'DOUBLE',
    'DROP',
    'ELSE',
    'ENABLE',
    'ENCRYPT',
    'END',
    'ENGINE',
    'ENTRY_POINT',
    'ESCAPE',
    'EXCEPTION',
    'EXCESS',
    'EXCLUDE',
    'EXECUTE',
    'EXISTS',
    'EXIT',
    'EXP',
    'EXTENDED',
    'EXTERNAL',
    'EXTRACT',
    'FALSE',
    'FETCH',
    'FILE',
    'FILTER',
    'FIRST',
    'FIRSTNAME',
    'FIRST_DAY',
    'FIRST_VALUE',
    'FLOAT',
    'FLOOR',
    'FOLLOWING',
    'FOR',
    'FOREIGN',
    'FREE_IT',
    'FROM',
    'FULL',
    'FUNCTION',
    'GDSCODE',
    'GENERATED',
    'GENERATOR',
    'GEN_ID',
    'GEN_UUID',
    'GLOBAL',
    'GRANT',
    'GRANTED',
    'GROUP',
    'HASH',
    'HAVING',
    'HEX_DECODE',
    'HEX_ENCODE',
    'HOUR',
    'IDENTITY',
    'IDLE',
    'IF',
    'IGNORE',
    'IIF',
    'IN',
    'INACTIVE',
    'INCLUDE',
    'INCREMENT',
    'INDEX',
    'INNER',
    'INPUT_TYPE',
    'INSENSITIVE',
    'INSERT',
    'INSERTING',
    'INT',
    'INT128',
    'INTEGER',
    'INTO',
    'INVOKER',
    'IS',
    'ISOLATION',
    'IV',
    'JOIN',
    'KEY',
    'LAG',
    'LAST',
    'LASTNAME',
    'LAST_DAY',
    'LAST_VALUE',
    'LATERAL',
    'LEAD',
    'LEADING',
    'LEAVE',
    'LEFT',
    'LEGACY',
    'LENGTH',
    'LEVEL',
    'LIFETIME',
    'LIKE',
    'LIMBO',
    'LINGER',
    'LIST',
    'LN',
    'LOCAL',
    'LOCALTIME',
    'LOCALTIMESTAMP',
    'LOCK',
    'LOG',
    'LOG10',
    'LONG',
    'LOWER',
    'LPAD',
    'LPARAM',
    'MAKE_DBKEY',
    'MANUAL',
    'MAPPING',
    'MATCHED',
    'MATCHING',
    'MAX',
    'MAXVALUE',
    'MERGE',
    'MESSAGE',
    'MIDDLENAME',
    'MILLISECOND',
    'MIN',
    'MINUTE',
    'MINVALUE',
    'MOD',
    'MODE',
    'MODULE_NAME',
    'MONTH',
    'NAME',
    'NAMES',
    'NATIONAL',
    'NATIVE',
    'NATURAL',
    'NCHAR',
    'NEXT',
    'NO',
    'NORMALIZE_DECFLOAT',
    'NOT',
    'NTH_VALUE',
    'NTILE',
    'NULL',
    'NULLIF',
    'NULLS',
    'NUMBER',
    'NUMERIC',
    'OCTET_LENGTH',
    'OF',
    'OFFSET',
    'OLDEST',
    'ON',
    'ONLY',
    'OPEN',
    'OPTION',
    'OR',
    'ORDER',
    'OS_NAME',
    'OTHERS',
    'OUTER',
    'OUTPUT_TYPE',
    'OVER',
    'OVERFLOW',
    'OVERLAY',
    'OVERRIDING',
    'PACKAGE',
    'PAD',
    'PAGE',
    'PAGES',
    'PAGE_SIZE',
    'PARAMETER',
    'PARTITION',
    'PASSWORD',
    'PERCENT_RANK',
    'PI',
    'PKCS_1_5',
    'PLACING',
    'PLAN',
    'PLUGIN',
    'POOL',
    'POSITION',
    'POST_EVENT',
    'POWER',
    'PRECEDING',
    'PRECISION',
    'PRESERVE',
    'PRIMARY',
    'PRIOR',
    'PRIVILEGE',
    'PRIVILEGES',
    'PROCEDURE',
    'PROTECTED',
    'PUBLICATION',
    'QUANTIZE',
    'RAND',
    'RANGE',
    'RANK',
    'RDB$DB_KEY',
    'RDB$ERROR',
    'RDB$GET_CONTEXT',
    'RDB$GET_TRANSACTION_CN',
    'RDB$RECORD_VERSION',
    'RDB$ROLE_IN_USE',
    'RDB$SET_CONTEXT',
    'RDB$SYSTEM_PRIVILEGE',
    'READ',
    'REAL',
    'RECORD_VERSION',
    'RECREATE',
    'RECURSIVE',
    'REFERENCES',
    'REGR_AVGX',
    'REGR_AVGY',
    'REGR_COUNT',
    'REGR_INTERCEPT',
    'REGR_R2',
    'REGR_SLOPE',
    'REGR_SXX',
    'REGR_SXY',
    'REGR_SYY',
    'RELATIVE',
    'RELEASE',
    'REPLACE',
    'REQUESTS',
    'RESERV',
    'RESERVING',
    'RESET',
    'RESETTING',
    'RESTART',
    'RESTRICT',
    'RETAIN',
    'RETURN',
    'RETURNING',
    'RETURNING_VALUES',
    'RETURNS',
    'REVERSE',
    'REVOKE',
    'RIGHT',
    'ROLE',
    'ROLLBACK',
    'ROUND',
    'ROW',
    'ROWS',
    'ROW_COUNT',
    'ROW_NUMBER',
    'RPAD',
    'RSA_DECRYPT',
    'RSA_ENCRYPT',
    'RSA_PRIVATE',
    'RSA_PUBLIC',
    'RSA_SIGN_HASH',
    'RSA_VERIFY_HASH',
    'SALT_LENGTH',
    'SAVEPOINT',
    'SCALAR_ARRAY',
    'SCHEMA',
    'SCROLL',
    'SECOND',
    'SECURITY',
    'SEGMENT',
    'SELECT',
    'SENSITIVE',
    'SEQUENCE',
    'SERVERWIDE',
    'SESSION',
    'SET',
    'SHADOW',
    'SHARED',
    'SIGN',
    'SIGNATURE',
    'SIMILAR',
    'SIN',
    'SINGULAR',
    'SINH',
    'SIZE',
    'SKIP',
    'SMALLINT',
    'SNAPSHOT',
    'SOME',
    'SORT',
    'SOURCE',
    'SPACE',
    'SQL',
    'SQLCODE',
    'SQLSTATE',
    'SQRT',
    'STABILITY',
    'START',
    'STARTING',
    'STARTS',
    'STATEMENT',
    'STATISTICS',
    'STDDEV_POP',
    'STDDEV_SAMP',
    'SUBSTRING',
    'SUB_TYPE',
    'SUM',
    'SUSPEND',
    'SYSTEM',
    'TABLE',
    'TAGS',
    'TAN',
    'TANH',
    'TEMPORARY',
    'THEN',
    'TIES',
    'TIME',
    'TIMEOUT',
    'TIMESTAMP',
    'TIMEZONE_HOUR',
    'TIMEZONE_MINUTE',
    'TO',
    'TOTALORDER',
    'TRAILING',
    'TRANSACTION',
    'TRAPS',
    'TRIGGER',
    'TRIM',
    'TRUE',
    'TRUNC',
    'TRUSTED',
    'TWO_PHASE',
    'TYPE',
    'UNBOUNDED',
    'UNCOMMITTED',
    'UNDO',
    'UNION',
    'UNIQUE',
    'UNKNOWN',
    'UPDATE',
    'UPDATING',
    'UPPER',
    'USAGE',
    'USER',
    'USING',
    'UUID_TO_CHAR',
    'VALUE',
    'VALUES',
    'VARBINARY',
    'VARCHAR',
    'VARIABLE',
    'VARYING',
    'VAR_POP',
    'VAR_SAMP',
    'VIEW',
    'WAIT',
    'WEEK',
    'WEEKDAY',
    'WHEN',
    'WHERE',
    'WHILE',
    'WINDOW',
    'WITH',
    'WITHOUT',
    'WORK',
    'WRITE',
    'YEAR',
    'YEARDAY',
    'ZONE',
]);
