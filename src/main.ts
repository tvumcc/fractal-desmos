import { AppState } from "./app_state.ts";
import { Expression } from "./expression.ts";
import {Lexer} from "./lexer.ts"
import {Parser} from "./parser.ts"
import {Renderer} from "./renderer.ts"

document.addEventListener("DOMContentLoaded", function() {
    console.log("Hello")
    let collapse_buttons: HTMLCollection = document.getElementsByClassName("collapse-button") as HTMLCollection
    for (let element of collapse_buttons) {
        let collapse_button = element as HTMLButtonElement
        collapse_button.addEventListener("click", () => {
            let div: HTMLDivElement = document.getElementById(collapse_button.name) as HTMLDivElement
            
            if (div.style.display !== "none") {
                div.style.display = "none"
                collapse_button.style.transform = "rotate(0deg)"
            } else {
                if (collapse_button.name === "presets") {
                    div.style.display = "grid"
                } else {
                    div.style.display = "block"
                }
                collapse_button.style.transform = "rotate(90deg)"
            }
        })
    }

    let panel_collapse_button: HTMLButtonElement = document.getElementById("panel-collapse-button") as HTMLButtonElement
    panel_collapse_button.addEventListener("click", () => {
        let side_panel: HTMLDivElement = document.getElementById("side-panel") as HTMLDivElement
        if (side_panel.style.display !== "none") {
            side_panel.style.display = "none"
            panel_collapse_button.style.transform = "rotate(0deg)"
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        } else {
            side_panel.style.display = "flex"
            panel_collapse_button.style.transform = "rotate(180deg)"
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
    })

})


let canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
window.addEventListener("resize", () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
})

let color_maps: Map<string, string> = new Map([
    ["green", "return 2.0 * mix(vec3(0.0, 0.0, 0.0), vec3(0.4, 0.8, 0.6), t);"],
    ["rainbow", `
    var c: vec3f = vec3f(5.0 * t, 0.5, 1.0);
    var K: vec4f = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    var p: vec3f = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
    `],
    ["viridis", `
        var i: f32 = t * 2.0;
        var c0: vec3f = vec3f(0.274344,0.004462,0.331359);
        var c1: vec3f = vec3f(0.108915,1.397291,1.388110);
        var c2: vec3f = vec3f(-0.319631,0.243490,0.156419);
        var c3: vec3f = vec3f(-4.629188,-5.882803,-19.646115);
        var c4: vec3f = vec3f(6.181719,14.388598,57.442181);
        var c5: vec3f = vec3f(4.876952,-13.955112,-66.125783);
        var c6: vec3f = vec3f(-5.513165,4.709245,26.582180);
        return c0+i*(c1+i*(c2+i*(c3+i*(c4+i*(c5+i*c6))))); 
    `],
])

let renderer: Renderer = new Renderer(canvas)
await renderer.init_webgpu()
renderer.init_vertex_buffer()

export let state: AppState = new AppState()
state.set_color_map(color_maps.get("rainbow")!)
let uniforms: Float32Array<ArrayBuffer> = new Float32Array(14);
parse(document.getElementById("z0")?.innerText as string, document.getElementById("fz")?.innerText as string)

let color_map_buttons: HTMLCollection = document.getElementsByClassName("color-map-button") as HTMLCollection
for (let button of color_map_buttons) {
    let color_map_button = button as HTMLButtonElement
    color_map_button.addEventListener("click", () => {
        state.set_color_map(color_maps.get(color_map_button.id)!)
        renderer.set_shader_code(state.get_shader_code())
        renderer.set_uniforms(uniforms)
    })
}

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