import { AppState } from "./app_state.ts";
import { Expression } from "./expression.ts";
import {Lexer} from "./lexer.ts"
import {Parser} from "./parser.ts"
import {Renderer} from "./renderer.ts"

let canvas = document.getElementById("webgpu_canvas") as HTMLCanvasElement
canvas.width = canvas.clientWidth / 2;
canvas.height = canvas.clientHeight / 2;
window.addEventListener("resize", () => {
    canvas.width = canvas.clientWidth / 2;
    canvas.height = canvas.clientHeight / 2;
})

let renderer: Renderer = new Renderer(canvas)
await renderer.init_webgpu()
renderer.init_vertex_buffer()

let state: AppState = new AppState()
let uniforms: Float32Array<ArrayBuffer> = new Float32Array(10);
parse(document.getElementById("z0")?.innerText as string, document.getElementById("fz")?.innerText as string)

canvas.addEventListener("contextmenu", event => event.preventDefault())
canvas.addEventListener("mousedown", (event) => {
    if (event.button === 2)
        state.right_mouse_down = true
})
canvas.addEventListener("mouseup", (event) => {
    if (event.button === 2)
        state.right_mouse_down = false
})
canvas.addEventListener("mousemove", (event) => {
    if (state.right_mouse_down) {
        let rect = canvas.getBoundingClientRect()
        state.c_real = (event.x - rect.left) / canvas.width * 2 - 1
        state.c_imag = (event.y - rect.top) / canvas.height * 2 - 1
    }
})


export function parse(z0: string, equation: string) {
    let parameters: Map<string, string> = new Map([
        ["i", "vec2f(0.0, 1.0)"],
        ["x", "x"],
        ["t", "uniforms.t"],
        ["z", "z"],
        ["c", "uniforms.c"]
    ])

    let lexer: Lexer = new Lexer(z0, parameters)
    lexer.lex()
    let parser: Parser = new Parser(lexer.tokens)
    parser.parse()
    let z0_AST: Expression = parser.AST

    lexer = new Lexer(equation, parameters)
    lexer.lex()
    parser = new Parser(lexer.tokens)
    parser.parse()
    let equation_AST: Expression = parser.AST

    if (parser.valid) {
        console.log(`Latex: ${equation}\nTokens: ${lexer.toString()}\nAST: ${equation_AST.toString()}`)
        state.set_AST(z0_AST, equation_AST)
        state.init_variables()

        renderer.set_shader_code(state.get_shader_code())

        uniforms = new Float32Array(4.0 * Math.ceil((10 + 2 * state.variables.size) / 4.0))
        state.update_uniform_array(uniforms)
        renderer.set_uniforms(uniforms)
        state.insert_user_var_sliders()
    } else {
        console.log(parser.error_message)
    }
}

function render_loop() {
    uniforms.set([canvas.width, canvas.height], 8) // Canvas Dimensions
    state.update_uniform_array(uniforms)
    renderer.update_uniform_buffer(uniforms)
    renderer.render()
    renderer.render()

    requestAnimationFrame(render_loop)
}

render_loop()