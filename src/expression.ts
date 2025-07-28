import {Token} from "./token.ts"

export abstract class Expression {
    abstract str(): string
}

export class Unary extends Expression {
    func: Token
    inner: Expression

    constructor(func: Token, inner: Expression) {
        super()
        this.func = func
        this.inner = inner
    }

    str(): string {
        return `${this.func.str()}[${this.inner.str()}]`
    }
}

export class Binary extends Expression {
    left: Expression
    func: Token
    right: Expression

    constructor(left: Expression, func: Token, right: Expression) {
        super()
        this.left = left
        this.func = func
        this.right = right
    }
    str(): string {
        return `${this.func.str()}[${this.left.str()}, ${this.right.str()}]`
    }
}

export class Literal extends Expression {
    value: Token

    constructor(value: Token) {
        super()
        this.value = value
    }
    str(): string {
        return `${this.value.str()}`
    }
}

export class Variable extends Expression {
    identifier: Token
    constructor(identifier: Token) {
        super()
        this.identifier = identifier 
    }
    str(): string {
        return `${this.identifier.str()}`
    }
}

export class ParseError extends Expression {
    error_message: string

    constructor(error_message: string) {
        super()
        this.error_message = error_message
    }

    str(): string {
        return `ERROR[${this.error_message}]`
    }
}