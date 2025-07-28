import * as Expr from "./expression.ts"
import { TokenType } from "./token.ts";

class UserVar {
    id: number
    real: number
    imag: number

    constructor(id: number, real: number, imag: number) {
        this.id = id
        this.real = real
        this.imag = imag
    }

    toString(): string {
        return `{id=${this.id}, ${this.real}+${this.imag}i}`
    }
}

export class AppState {
    variables: Map<string, UserVar> = new Map()
    initial_value_AST!: Expr.Expression
    equation_AST!: Expr.Expression

    valid: boolean = true;

    constructor() {

    }

    set_AST(AST: Expr.Expression) {
        let new_var_map: Map<string, UserVar> = new Map()
        this.get_vars(AST, new_var_map)
        for (let [k, v] of new_var_map) {
            if (this.variables.has(k)) {
                this.variables.get(k)!.id = v.id
            } else {
                this.variables.set(k, v)
            }
        }

        for (let [k, v] of this.variables) {
            if (!new_var_map.has(k)) {
                this.variables.delete(k)
            }
        }
    }

    get_vars(AST: Expr.Expression, new_var_map: Map<string, UserVar>) {
        if (AST instanceof Expr.Unary) {
            this.get_vars((AST as Expr.Unary).inner, new_var_map)
        } else if (AST instanceof Expr.Binary) {
            this.get_vars((AST as Expr.Binary).left, new_var_map)
            this.get_vars((AST as Expr.Binary).right, new_var_map)
        } else if (AST instanceof Expr.Literal) {

        } else if (AST instanceof Expr.Variable) {
            if (!new_var_map.has((AST as Expr.Variable).identifier.value) && (AST as Expr.Variable).identifier.type == TokenType.IDENTIFIER) {
                new_var_map.set((AST as Expr.Variable).identifier.value, new UserVar(new_var_map.size, 0.0, 0.0))
            }
        } else if (AST instanceof Expr.ParseError) {
            this.valid = false
        }
    }

    print() {
        for (let [k, v] of this.variables) {
            console.log(`${k} : ${v.toString()}`)
        }
    }

    get_shader_code(AST: Expr.Expression) {
        console.log(this.get_code(AST))
    }

    get_code(AST: Expr.Expression): string {
        if (AST instanceof Expr.Unary) {
            switch (AST.func.type) {
                case TokenType.MINUS: return `-(${this.get_code(AST.inner)})`
                case TokenType.SQRT:  return `complex_sqrt(${this.get_code(AST.inner)})`
                case TokenType.SIN:   return `complex_sin(${this.get_code(AST.inner)})`
                case TokenType.COS:   return `complex_cos(${this.get_code(AST.inner)})`
                case TokenType.TAN:   return `complex_tan(${this.get_code(AST.inner)})`
                case TokenType.LOG:   return `complex_log(${this.get_code(AST.inner)})`
                case TokenType.LN:    return `complex_ln(${this.get_code(AST.inner)})`
            }
        } else if (AST instanceof Expr.Binary) {
            switch (AST.func.type) {
                case TokenType.PLUS:     return `(${this.get_code(AST.left)}) + (${this.get_code(AST.right)})`
                case TokenType.MINUS:    return `(${this.get_code(AST.left)}) - (${this.get_code(AST.right)})`
                case TokenType.DOT:      return `complex_mult(${this.get_code(AST.left)}, ${this.get_code(AST.right)})`
                case TokenType.FRACTION: return `complex_div(${this.get_code(AST.left)}, ${this.get_code(AST.right)})`
                case TokenType.CARET:    return `complex_pow(${this.get_code(AST.left)}, ${this.get_code(AST.right)})`
            }
        } else if (AST instanceof Expr.Literal) {
            switch (AST.value.type) {
                case TokenType.REAL:      return `vec2f(${AST.value.value}, 0.0)`
                case TokenType.IMAGINARY: return `vec2f(0.0, ${AST.value.value})`
            }
        } else if (AST instanceof Expr.Variable) {
            switch (AST.identifier.type) {
                case TokenType.IDENTIFIER: return `uniforms.u${this.variables.get(AST.identifier.value)!.id}`
                case TokenType.PARAMETER: {
                    if (AST.identifier.value === "t") {
                        return `uniforms.${AST.identifier.value}`
                    } else {
                        return `${AST.identifier.value}`
                    }
                }
            }
        }

        return ""
    }

    get_user_var_struct_fields(): string {
        let out: string = ""
        for (let [k, v] of this.variables) {
            out += `\tu${v.id}: vec2f,\n`
        }
        return out;
    }
}