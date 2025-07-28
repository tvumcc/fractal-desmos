import { AppState } from "./app_state.ts";
import { Expression } from "./expression.ts";
import {Lexer} from "./lexer.ts"
import {Parser} from "./parser.ts"
import {Renderer} from "./renderer.ts"

let canvas = document.getElementById("webgpu_canvas") as HTMLCanvasElement
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
window.addEventListener("resize", () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
})

let renderer: Renderer = new Renderer(canvas)
await renderer.init_webgpu()
renderer.init_vertex_buffer()

let state: AppState = new AppState()
let uniforms: Float32Array<ArrayBuffer> = new Float32Array(8);
parse(document.getElementById("z0")?.innerText as string, document.getElementById("fz")?.innerText as string)

export function parse(z0: string, equation: string) {
    let lexer: Lexer = new Lexer(z0, ["x", "t", "z"])
    lexer.lex()
    let parser: Parser = new Parser(lexer.tokens)
    parser.parse()
    let z0_AST: Expression = parser.AST

    lexer = new Lexer(equation, ["x", "t", "z"])
    lexer.lex()
    parser = new Parser(lexer.tokens)
    parser.parse()
    let equation_AST: Expression = parser.AST

    if (parser.valid) {
        console.log(`Latex: ${equation}\nTokens: ${lexer.toString()}\nAST: ${equation_AST.toString()}`)
        state.set_AST(z0_AST, equation_AST)
        renderer.set_shader_code(state.get_shader_code())

        uniforms = new Float32Array(4.0 * Math.ceil((8.0 + 2 * state.variables.size) / 4.0))
        state.update_uniform_array(uniforms)
        renderer.set_uniforms(uniforms)
    } else {
        console.log(parser.error_message)
    }
}

function render_loop() {
    uniforms.set([canvas.width, canvas.height], 6) // Canvas Dimensions
    state.update_uniform_array(uniforms)
    renderer.update_uniform_buffer(uniforms)
    renderer.render()

    requestAnimationFrame(render_loop)
}

render_loop()