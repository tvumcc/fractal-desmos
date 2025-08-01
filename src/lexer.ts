import {Token, TokenType} from "./token.ts"

export class Lexer {
    tokens: Token[] = []
    expr: string
    parameters: Map<string, string>
    idx: number = 0

    command_mapping: Map<string, TokenType> = new Map([
        ["left", TokenType.LEFT_PAREN],
        ["right", TokenType.RIGHT_PAREN],
        ["{", TokenType.LEFT_PAREN],
        ["}", TokenType.LEFT_PAREN],
        ["cdot", TokenType.DOT],
        ["frac", TokenType.FRACTION],
        ["sqrt", TokenType.SQRT],
        ["sin", TokenType.SIN],
        ["cos", TokenType.COS],
        ["tan", TokenType.TAN],
        ["ln",  TokenType.LN],
        ["log", TokenType.LOG]
    ])

    // TODO: add support for the greek letters/symbols
    symbols = [
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "zeta",
        "eta",
        "theta",
        "iota",
        "kappa",
        "lambda",
        "mu",
        "nu",
        "xi",
        "omikron",
        "pi",
        "rho",
        "sigma",
        "tau",
        "upsilon",
        "chi",
        "psi",
        "omega"
    ]

    constructor(expr: string, parameters: Map<string, string>) {
        this.expr = expr
        this.parameters = parameters
    } 

    lex() {
        while (this.idx < this.expr.length) {
            switch (this.peek()) {
                case " ":
                case "(":
                case ")":
                    this.advance()
                    break;
                case "{": {
                    this.add_token(new Token(TokenType.LEFT_PAREN), 1)
                } break;
                case "}": {
                    this.add_token(new Token(TokenType.RIGHT_PAREN), 1)
                } break;
                case "+": {
                    this.add_token(new Token(TokenType.PLUS), 1)
                } break;
                case "-": {
                    this.add_token(new Token(TokenType.MINUS), 1)
                } break;
                case "^": {
                    this.add_token(new Token(TokenType.CARET), 1)
                } break;

                // Commands
                case "\\": {
                    let match: boolean = false;
                    for (const [k, v] of this.command_mapping) {
                        if (this.match_next(k)) {
                            this.add_token(new Token(v), k.length+1)
                            match = true;
                            break;
                        }
                    }
                    for (let symbol of this.symbols) {
                        if (this.match_next(symbol)) {
                            let identifier = "\\" + symbol;
                            this.advance(identifier.length)
                            if (this.peek() === "_") {
                                identifier += this.peek()
                                this.advance()

                                if (this.peek() === "{") {
                                    let count = 1
                                    identifier += this.peek()
                                    this.advance();

                                    while (count > 0) {
                                        if (this.peek() === "}") count -= 1
                                        else if (this.peek() === "{") count += 1
                                        identifier += this.peek()
                                        this.advance()
                                    }
                                } else {
                                    identifier += this.peek()
                                    this.advance()
                                }
                            }
                            this.add_token(new Token(TokenType.IDENTIFIER, identifier))
                            match = true;
                            break;
                        }
                    }

                    if (!match) {
                        if (this.match_next(" ")) {
                            this.advance(2)
                            break
                        }
                        // throw an error
                        console.log("failed to match command")
                        return
                    }
                } break;

                default: {
                    if (this.peek().match("[0-9]")) { // Reals
                        let literal: string = ""
                        while (this.peek().match("[0-9]")) {
                            literal += this.peek()
                            this.advance()
                        }
                        if (this.peek().match("\\.")) {
                            literal += this.peek()
                            this.advance();
                        }
                        while (this.peek().match("[0-9]")) {
                            literal += this.peek()
                            this.advance()
                        }

                        this.add_token(new Token(TokenType.REAL, literal))
                    } else if (this.peek().match("[a-zA-z]")) { // Identifiers and Parameters
                        let identifier: string = this.peek()
                        this.advance()

                        if (this.peek() === "_") {
                            identifier += this.peek()
                            this.advance()

                            if (this.peek() === "{") {
                                let count = 1
                                identifier += this.peek()
                                this.advance();

                                while (count > 0) {
                                    if (this.peek() === "}") count -= 1
                                    else if (this.peek() === "{") count += 1
                                    identifier += this.peek()
                                    this.advance()
                                }
                            } else {
                                identifier += this.peek()
                                this.advance()
                            }
                        }

                        if (this.parameters.has(identifier)) {
                            this.add_token(new Token(TokenType.PARAMETER, this.parameters.get(identifier)))
                        } else {
                            this.add_token(new Token(TokenType.IDENTIFIER, identifier))
                        }
                    } else {
                        this.advance()
                        console.log("Invalid characters in expression!")
                    }
                } break;
            }
        }
    }

    toString(): string {
        let out: string = ""
        for (let token of this.tokens) {
            out += token.toString() + " " 
        }
        return out
    }

    match_next(str: string): boolean {
        return this.idx+str.length < this.expr.length && this.expr.substring(this.idx+1, this.idx+1+str.length) == str
    }

    add_token(token: Token, increment: number = 0) {
        this.tokens.push(token)
        this.idx += increment
    }

    peek(): string {
        if (this.idx < this.expr.length) {
            return this.expr.charAt(this.idx)
        } else {
            return "";
        }
    }

    advance(increment: number = 1) {
        if (this.idx < this.expr.length) {
            this.idx += increment
        } else {
            throw Error("Can't advance: reached end of expr")
        }
    }
}