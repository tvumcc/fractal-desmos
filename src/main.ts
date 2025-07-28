import { AppState } from "./app_state.ts";
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

let response = await fetch("/shader.wgsl")
let shader_code = await response.text()

let uniforms = new Float32Array(8)
uniforms.set([0.0, 1.0, 0.0, 1.0], 0);
uniforms.set([Math.PI, canvas.width, canvas.height, 0.0], 4);

let renderer: Renderer = new Renderer(canvas)
await renderer.init_webgpu()
renderer.init_vertex_buffer()
renderer.set_shader_code(shader_code)
renderer.set_uniforms(uniforms)

let state: AppState = new AppState()

export async function parse(equation: string) {
    let lexer: Lexer = new Lexer(equation, ["x", "t", "z"])
    lexer.lex()
    let parser: Parser = new Parser(lexer.tokens)
    parser.parse()

    if (parser.valid) {
        console.log(`Latex: ${equation}\nTokens: ${lexer.str()}\nAST: ${parser.AST.str()}`)
        state.set_AST(parser.AST)
        state.print()
        state.get_shader_code(parser.AST)

        let code: string = `
struct MyUniforms {
    color: vec4f,
    t: vec2f,
    width: f32,
    height: f32,
${state.get_user_var_struct_fields()}
};

@group(0) @binding(0) var<uniform> uniforms: MyUniforms;

@vertex
fn vs_main(@location(0) pos: vec2f) -> @builtin(position) vec4f {
    return vec4f(pos.x, pos.y, 0.0, 1.0);
} 

// See https://en.wikipedia.org/wiki/FOIL_method 
fn complex_mult(a: vec2f, b: vec2f) -> vec2f {
    return vec2f(
        a.x * b.x - a.y * b.y,
        a.x * b.y + a.y * b.x
    );
}

// See https://mathworld.wolfram.com/ComplexDivision.html
fn complex_div(a: vec2f, b: vec2f) -> vec2f {
    return vec2f(
        (a.x * b.x + a.y * b.y),
        (a.y * b.x - a.x * b.y)
    ) / (b.x * b.x + b.y * b.y);
}

// See https://mathworld.wolfram.com/ComplexExponentiation.html
fn complex_pow(a: vec2f, b: vec2f) -> vec2f {
    var arg: f32 = atan2(a.y, a.x);
    var inner: f32 = b.x * arg + 0.5 * b.y * log(a.x * a.x + a.y * a.y);

    return pow(a.x * a.x + a.y * a.y, b.x / 2.0) * exp(-b.y * arg) * vec2f(
        cos(inner),
        sin(inner)
    );
}

fn complex_sqrt(a: vec2f) -> vec2f {
    return complex_pow(a, vec2f(0.5, 0.0));
}

// See https://proofwiki.org/wiki/Sine_of_Complex_Number
fn complex_sin(a: vec2f) -> vec2f {
    return vec2f(
        sin(a.x) * cosh(a.y),
        cos(a.x) * sinh(a.y)
    );
}

// See https://proofwiki.org/wiki/Cosine_of_Complex_Number
fn complex_cos(a: vec2f) -> vec2f {
    return vec2f(
        cos(a.x) * cosh(a.y),
        sin(a.x) * sinh(a.y)
    );
}

// See https://proofwiki.org/wiki/Tangent_of_Complex_Number
fn complex_tan(a: vec2f) -> vec2f {
    return complex_div(complex_sin(a), complex_cos(a));
}

// See https://proofwiki.org/wiki/Definition:Natural_Logarithm/Complex
fn complex_ln(a: vec2f) -> vec2f {
    return vec2f(
        0.5 * log(a.x * a.x + a.y * a.y),
        atan2(a.y, a.x)
    );
}

fn complex_log(a: vec2f) -> vec2f {
    return complex_ln(a) / log(10);
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    var starting_color: vec3f = vec3f(0.0, 0.0, 0.0);
    var ending_color: vec3f = vec3f(0.4, 0.8, 0.6);
    var aspect_ratio: f32 = uniforms.width / uniforms.height;
    var iterations: i32 = 60;
    var zoom: f32 = 2.0;

    var x: vec2f = vec2f(
        ((position.x / uniforms.width) * 2.0 - 1.0) * aspect_ratio * zoom,
        ((position.y / uniforms.height) * 2.0 - 1.0) * zoom
    );

    var z: vec2f = x;

    var c: vec2f = 0.8 * (vec2f(complex_cos(uniforms.t).x, 0.0) + vec2f(0.0, complex_sin(uniforms.t).x));

    var total: f32 = 0.0;
    var color: vec3f = vec3f(0.4, 0.8, 0.6);
    var escaped: bool = false;

    for (var i: i32 = 0; i < iterations; i++) {
        z = ${state.get_code(parser.AST)};
        if (length(z) > 2.0) {
            total = f32(i);
            escaped = true;
            break;
        }
    }

    if (escaped) {
        color = mix(starting_color, ending_color, total / f32(iterations));
    } else {
        color = vec3(0.0);
    }

    return 2.0 * vec4(color, 1.0);
}`
        console.log(code)
        renderer.set_shader_code(code)
        console.log((await renderer.shader_module.getCompilationInfo()).messages)

        uniforms = new Float32Array(4.0 * Math.ceil((8.0 + 2 * state.variables.size) / 4.0))
        uniforms.set([0.0, 1.0, 0.0, 1.0], 0); // Color
        uniforms.set([performance.now() / 1000, 0.0], 4) // Time
        uniforms.set([canvas.width, canvas.height], 6) // Canvas Dimensions
        let count = 0
        for (let [k, v] of state.variables) {
            uniforms.set([v.real, v.imag], 8 + 2 * count)
            count += 1
        }
        renderer.set_uniforms(uniforms)
    } else {
        console.log(parser.error_message)
    }
}

function render_loop() {
    uniforms = new Float32Array(4.0 * Math.ceil((8.0 + 2 * state.variables.size) / 4.0))
    uniforms.set([0.0, 1.0, 0.0, 1.0], 0); // Color
    uniforms.set([performance.now() / 1000, 0.0], 4) // Time
    uniforms.set([canvas.width, canvas.height], 6) // Canvas Dimensions
    let count = 0
    for (let [k, v] of state.variables) {
        uniforms.set([v.real, v.imag], 8 + 2 * count)
        count += 1
    }
    renderer.change_uniforms(uniforms)
    // console.log(uniforms)

    renderer.render()

    requestAnimationFrame(render_loop)
}

render_loop()