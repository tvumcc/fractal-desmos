export enum TokenType {
    // Literals
    REAL, IMAGINARY, IDENTIFIER, PARAMETER,

    // Operators
    PLUS, MINUS, DOT, FRACTION, CARET,    

    // Grouping
    LEFT_PAREN, RIGHT_PAREN,

    // Reserved Functions
    SQRT, SIN, COS, TAN, LN, LOG
}

export class Token {
    type: TokenType;
    value: string;

    constructor(type: TokenType, value: string = "") {
        this.type = type
        this.value = value
    }

    str(): string {
        if (this.value === "") {
            return TokenType[this.type]
        } else {
            return `{${TokenType[this.type]}: ${this.value}}`
        }
    }
}