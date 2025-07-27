var canvas = document.getElementById("webgpu_canvas") as HTMLCanvasElement
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
window.addEventListener("resize", () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
})

enum TokenType {
    // Literals
    REAL, IMAGINARY, IDENTIFIER, PARAMETER,

    // Operators
    PLUS, MINUS, DOT, FRACTION, CARET,    

    // Grouping
    LEFT_PAREN, RIGHT_PAREN,

    // Reserved Functions
    SQRT, SIN, COS, TAN, LN, LOG
}

class Token {
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

class Lexer {
    tokens: Token[] = []
    expr: string
    parameter: string
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

    constructor(expr: string, parameter: string) {
        this.expr = expr
        this.parameter = parameter
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
                case "i": {
                    this.add_token(new Token(TokenType.IMAGINARY, "1"), 1)
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
                    // Real and Imaginary:
                    if (this.peek().match("[0-9]")) {
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

                        if (this.peek() === "i") {
                            this.add_token(new Token(TokenType.IMAGINARY, literal), 1)
                        } else {
                            this.add_token(new Token(TokenType.REAL, literal))
                        }
                    } else if (this.peek().match("[a-zA-z]")) {
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

                        this.add_token(new Token(TokenType.IDENTIFIER, identifier))
                    } else {
                        this.advance()
                        console.log("Invalid characters in expression!")
                    }
                } break;
            }
        }
    }

    str(): string {
        let out: string = ""
        for (let token of this.tokens) {
            out += token.str() + " " 
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

// let expr: string = "2+2i\\cdot4i"
// let lexer: Lexer = new Lexer(expr, "z")
// lexer.lex()
// console.log(expr)
// console.log(lexer.str())

abstract class Expression {
    abstract str(): string
}
class UnaryExpression extends Expression {
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
class BinaryExpression extends Expression {
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
class Literal extends Expression {
    value: Token

    constructor(value: Token) {
        super()
        this.value = value
    }
    str(): string {
        return `${this.value.str()}`
    }
}
class Variable extends Expression {
    identifier: Token
    constructor(identifier: Token) {
        super()
        this.identifier = identifier 
    }
    str(): string {
        return `${this.identifier.str()}`
    }
}
class Group extends Expression {
    inner: Expression
    constructor(inner: Expression) {
        super()
        this.inner = inner
    }
    str(): string {
        return `[${this.inner.str()}]`
    }
}

class Parser {
    tokens: Token[]
    AST!: Expression
    idx: number = 0
    
    constructor (tokens: Token[]) {
        this.tokens = tokens
    }

    parse() {
        this.AST = this.expression()
    }

    expression(): Expression {
        return this.term();
    }

    term(): Expression {
        let left: Expression = this.product()

        if (this.matches_tokens([TokenType.PLUS, TokenType.MINUS])) {
            let operator: Token = this.peek()!
            this.advance()
            let right: Expression = this.term()
            return new BinaryExpression(left, operator, right)
        }

        return left; 
    }

    product(): Expression {
        let left: Expression = this.unary()

        if (this.matches_tokens([TokenType.DOT])) {
            let operator: Token = this.peek()!
            this.advance()
            let right: Expression = this.product()
            return new BinaryExpression(left, operator, right)
        }

        return left
    }

    unary(): Expression {
        if (this.matches_tokens([TokenType.PLUS, TokenType.MINUS])) {
            let operator: Token = this.peek()!
            this.advance()
            let inner: Expression = this.unary()
            return new UnaryExpression(operator, inner)
        }

        return this.exponent()
    }

    exponent(): Expression {
        let base: Expression = this.quotient()

        if (this.matches_tokens([TokenType.CARET])) {
            let operator: Token = this.peek()!
            this.advance()
            let exp: Expression = this.exponent()
            return new BinaryExpression(base, operator, exp)
        }

        return base 
    }

    quotient(): Expression {
        if (this.matches_tokens([TokenType.FRACTION])) {
            let operator: Token = this.peek()!
            this.advance()
            let top: Expression = this.quotient()
            let bot: Expression = this.quotient()
            return new BinaryExpression(top, operator, bot)
        }

        return this.func()
    }

    func(): Expression {
        if (this.matches_tokens([TokenType.SQRT, TokenType.SIN, TokenType.COS, TokenType.TAN, TokenType.LOG, TokenType.LN])) {
            let operator: Token = this.peek()!
            this.advance()
            let inner: Expression = this.func()
            return new UnaryExpression(operator, inner)
        }

        return this.primary()
    }

    primary(): Expression {
        if (this.matches_tokens([TokenType.REAL, TokenType.IMAGINARY])) {
            let inner: Token = this.peek()!
            this.advance() 
            return new Literal(inner)
        } else if (this.matches_tokens([TokenType.IDENTIFIER, TokenType.PARAMETER])) {
            let inner: Token = this.peek()!
            this.advance() 
            return new Variable(inner)
        } else if (this.matches_tokens([TokenType.LEFT_PAREN])) {
            this.advance()
            let expr: Expression = this.expression()
            this.advance()
            return expr;
        } else {
            throw new Error("INVALID PRIMARRYY!!!")
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

export function parse(equation: string) {
    let lexer: Lexer = new Lexer(equation, "z")
    lexer.lex()
    console.log(equation)
    console.log(lexer.str())
    let parser: Parser = new Parser(lexer.tokens)
    parser.parse()
    console.log(parser.AST.str())
}

async function init_webgpu() {
    if (!navigator.gpu) {
        throw new Error("WebGPU Not Supported")
    }

    const adapter = await navigator.gpu.requestAdapter() as GPUAdapter
    const device = await adapter.requestDevice() as GPUDevice
    const context = canvas.getContext("webgpu")
    const canvas_format = navigator.gpu.getPreferredCanvasFormat();

    context?.configure({
        device: device,
        format: canvas_format
    })

    return {
        device: device, 
        context: context, 
        canvas_format: canvas_format
    }
}

const webgpu_ctx = await init_webgpu()
const device = webgpu_ctx.device
const context = webgpu_ctx.context
const canvas_format = webgpu_ctx.canvas_format

const uniforms = new Float32Array(8)
uniforms.set([0.0, 1.0, 0.0, 1.0], 0);
uniforms.set([Math.PI, canvas.width, canvas.height, 0.0], 4);
const uniform_buffer = device.createBuffer({
    label: "uniform buffer",
    size: uniforms.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST 
}) as GPUBuffer
device.queue.writeBuffer(uniform_buffer, 0, uniforms);


const vertices = new Float32Array([
//   X,    Y,
  -1.0, -1.0, // Triangle 1 (Blue)
   1.0, -1.0,
   1.0,  1.0,

  -1.0, -1.0, // Triangle 2 (Red)
   1.0,  1.0,
  -1.0,  1.0,
]);

const vertex_buffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
}) as GPUBuffer
device.queue.writeBuffer(vertex_buffer, 0, vertices)
const vertex_buffer_layout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0
    }]

} as GPUVertexBufferLayout

const response = await fetch("/shader.wgsl")
const shader_code = await response.text()

const shader_module = device.createShaderModule({
    code: shader_code
}) as GPUShaderModule
const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
        module: shader_module,
        entryPoint: "vs_main",
        buffers: [vertex_buffer_layout]
    },
    fragment: {
        module: shader_module,
        entryPoint: "fs_main",
        targets: [{format: canvas_format}]
    }
}) as GPURenderPipeline

const bind_group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
        binding: 0,
        resource: {buffer: uniform_buffer}
    }]
}) as GPUBindGroup


function render_loop() {
    if (!context) {
        throw new Error("WebGPU Context is null")
    }
    uniforms.set([performance.now() / 1000, canvas.width, canvas.height], 4);
    device.queue.writeBuffer(uniform_buffer, 0, uniforms)

    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {r: 1.0, g: 0.0, b: 0.0, a: 1.0},
            storeOp: "store"
        }]
    })
    pass.setPipeline(pipeline)
    pass.setVertexBuffer(0, vertex_buffer)
    pass.setBindGroup(0, bind_group)
    pass.draw(vertices.length / 2)
    pass.end()
    device.queue.submit([encoder.finish()])
    requestAnimationFrame(render_loop)
}

render_loop()