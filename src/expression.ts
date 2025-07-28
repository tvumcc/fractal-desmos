import {Token} from "./token.ts"

export abstract class Expression {
    abstract toString(): string
}

export class Unary extends Expression {
    func: Token
    inner: Expression

    constructor(func: Token, inner: Expression) {
        super()
        this.func = func
        this.inner = inner
    }

    toString(): string {
        return `${this.func.toString()}[${this.inner.toString()}]`
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
    toString(): string {
        return `${this.func.toString()}[${this.left.toString()}, ${this.right.toString()}]`
    }
}

export class Literal extends Expression {
    value: Token

    constructor(value: Token) {
        super()
        this.value = value
    }
    toString(): string {
        return `${this.value.toString()}`
    }
}

export class Variable extends Expression {
    identifier: Token
    constructor(identifier: Token) {
        super()
        this.identifier = identifier 
    }
    toString(): string {
        return `${this.identifier.toString()}`
    }
}

export class ParseError extends Expression {
    error_message: string

    constructor(error_message: string) {
        super()
        this.error_message = error_message
    }

    toString(): string {
        return `ERROR[${this.error_message}]`
    }
}