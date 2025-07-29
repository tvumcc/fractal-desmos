import {Token, TokenType} from "./token.ts"
import * as Expr from "./expression.ts"

export class Parser {
    tokens: Token[]
    AST!: Expr.Expression
    idx: number = 0

    valid: boolean = true
    error_message: string = ""
    
    constructor (tokens: Token[]) {
        this.tokens = tokens
    }

    parse() {
        this.AST = this.expression()
    }

    expression(): Expr.Expression {
        return this.term();
    }

    term(): Expr.Expression {
        let left: Expr.Expression = this.product()

        if (this.matches_tokens([TokenType.PLUS, TokenType.MINUS])) {
            let operator: Token = this.peek()!
            this.advance()
            let right: Expr.Expression = this.term()
            return new Expr.Binary(left, operator, right)
        }

        return left; 
    }

    product(): Expr.Expression {
        let left: Expr.Expression = this.unary()
        
        if (this.matches_tokens([TokenType.DOT])) {
            let operator: Token = this.peek()!
            this.advance()
            let right: Expr.Expression = this.product()
            return new Expr.Binary(left, operator, right)
        } else if (this.matches_tokens([TokenType.LEFT_PAREN, TokenType.IDENTIFIER, TokenType.PARAMETER, TokenType.SQRT, TokenType.SIN, TokenType.COS, TokenType.TAN, TokenType.LOG, TokenType.LN])) {
            let right: Expr.Expression
            if (this.matches_tokens([TokenType.LEFT_PAREN, TokenType.IDENTIFIER, TokenType.PARAMETER])) {
                right = new Expr.Binary(left, new Token(TokenType.DOT), this.primary())
            } else {
                right = new Expr.Binary(left, new Token(TokenType.DOT), this.func())
            }
            while (this.matches_tokens([TokenType.LEFT_PAREN, TokenType.IDENTIFIER, TokenType.PARAMETER, TokenType.SQRT, TokenType.SIN, TokenType.COS, TokenType.TAN, TokenType.LOG, TokenType.LN])) {
                if (this.matches_tokens([TokenType.LEFT_PAREN, TokenType.IDENTIFIER, TokenType.PARAMETER])) {
                    right = new Expr.Binary(right, new Token(TokenType.DOT), this.primary())
                } else {
                    right = new Expr.Binary(right, new Token(TokenType.DOT), this.func())
                }
            }
            return right;
        }
        return left
    }

    unary(): Expr.Expression {
        if (this.matches_tokens([TokenType.MINUS])) {
            let operator: Token = this.peek()!
            this.advance()
            let inner: Expr.Expression = this.unary()
            return new Expr.Unary(operator, inner)
        }

        return this.exponent()
    }

    exponent(): Expr.Expression {
        let base: Expr.Expression = this.quotient()

        if (this.matches_tokens([TokenType.CARET])) {
            let operator: Token = this.peek()!
            this.advance()
            let exp: Expr.Expression = this.exponent()
            return new Expr.Binary(base, operator, exp)
        }

        return base 
    }

    quotient(): Expr.Expression{
        if (this.matches_tokens([TokenType.FRACTION])) {
            let operator: Token = this.peek()!
            this.advance()
            let top: Expr.Expression = this.quotient()
            let bot: Expr.Expression = this.quotient()
            return new Expr.Binary(top, operator, bot)
        }

        return this.func()
    }

    func(): Expr.Expression {
        if (this.matches_tokens([TokenType.SQRT, TokenType.SIN, TokenType.COS, TokenType.TAN, TokenType.LOG, TokenType.LN])) {
            let operator: Token = this.peek()!
            this.advance()
            let inner: Expr.Expression = this.func()
            return new Expr.Unary(operator, inner)
        }

        return this.primary()
    }

    primary(): Expr.Expression {
        if (this.matches_tokens([TokenType.REAL])) {
            let inner: Token = this.peek()!
            this.advance() 
            return new Expr.Literal(inner)
        } else if (this.matches_tokens([TokenType.IDENTIFIER, TokenType.PARAMETER])) {
            let inner: Token = this.peek()!
            this.advance() 
            return new Expr.Variable(inner)
        } else if (this.matches_tokens([TokenType.LEFT_PAREN])) {
            this.advance()
            let expr: Expr.Expression = this.expression()
            this.advance()
            return expr;
        } else {
            this.error_message = `ERROR: Invalid Syntax at character ${this.idx}`
            this.valid = false
            return new Expr.ParseError(this.error_message)
        }
    }

    peek(increment: number = 0): Token | null {
        if (this.idx + increment < this.tokens.length) {
            return this.tokens[this.idx + increment]
        } else {
            return null;
        }
    }

    matches_tokens(tokens: TokenType[], increment: number = 0): boolean {
        if (this.idx + increment < this.tokens.length) {
            for (let token of tokens) {
                if (token === this.tokens[this.idx+increment].type) {
                    return true;
                }
            }
        }
        return false;
    }

    advance(increment: number = 1) {
        if (this.idx < this.tokens.length) {
            this.idx += increment
        } else {
            throw Error("Can't advance: reached end of expr")
        }
    }
}