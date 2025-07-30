import { AppState } from "./app_state.ts";
import { Expression } from "./expression.ts";
import {Lexer} from "./lexer.ts"
import {Parser} from "./parser.ts"
import {Renderer} from "./renderer.ts"

let canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement
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
let uniforms: Float32Array<ArrayBuffer> = new Float32Array(14);
parse(document.getElementById("z0")?.innerText as string, document.getElementById("fz")?.innerText as string)

canvas.addEventListener("contextmenu", event => event.preventDefault())
canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
        state.left_mouse_down = true
        let rect = canvas.getBoundingClientRect()
        state.prev_mouse_x = (event.x - rect.left)
        state.prev_mouse_y = (event.y - rect.top)
    }
    if (event.button === 2)
        state.right_mouse_down = true
})
canvas.addEventListener("mouseup", (event) => {
    if (event.button === 0)
        state.left_mouse_down = false 
    if (event.button === 2)
        state.right_mouse_down = false
})
canvas.addEventListener("mousemove", (event) => {

    if (state.right_mouse_down) {
        let rect = canvas.getBoundingClientRect()
        state.c_real = (event.x - rect.left) / canvas.width * 2 - 1
        state.c_imag = (event.y - rect.top) / canvas.height * 2 - 1
    }

    if (state.left_mouse_down) {
        let rect = canvas.getBoundingClientRect()
        let curr_mouse_x = (event.x - rect.left)
        let curr_mouse_y = (event.y - rect.top)

        state.pan_real -= (((curr_mouse_x / canvas.width * 2 - 1) - (state.prev_mouse_x / canvas.width * 2 - 1)))
        state.pan_imag -= (((curr_mouse_y / canvas.height * 2 - 1) - (state.prev_mouse_y / canvas.height * 2 - 1)))
        state.prev_mouse_x = curr_mouse_x
        state.prev_mouse_y = curr_mouse_y
    }
})
canvas.addEventListener("wheel", (event) => {
    let rect = canvas.getBoundingClientRect()
    let mouse_x = (((event.x - rect.left) / canvas.width * 2 - 1))
    let mouse_y = (((event.y - rect.top) / canvas.height * 2 - 1))

    let old_zoom = state.zoom
    if (event.deltaY > 0) {
        state.zoom /= 0.95
    } else {
        state.zoom *= 0.95
    }
    console.log(`${(state.pan_real + mouse_x) * state.zoom}, ${(state.pan_imag + mouse_y) * state.zoom}`)

    state.pan_real = (old_zoom / state.zoom) * (state.pan_real + mouse_x) - mouse_x
    state.pan_imag = (old_zoom / state.zoom) * (state.pan_imag + mouse_y) - mouse_y
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

        uniforms = new Float32Array(4.0 * Math.ceil((14 + 2 * state.variables.size) / 4.0))
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

    requestAnimationFrame(render_loop)
}

render_loop()