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

export function parse(equation: string) {
    let lexer: Lexer = new Lexer(equation, "z")
    lexer.lex()
    console.log(equation)
    console.log(lexer.str())
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