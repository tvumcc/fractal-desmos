import * as Expr from "./expression.ts"
import { TokenType } from "./token.ts";

export class UserVar {
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

    valid: boolean = true

    left_mouse_down = false
    right_mouse_down = false
    prev_mouse_x = 0.0
    prev_mouse_y = 0.0

    c_real: number = 0.0
    c_imag: number = 0.0

    zoom: number = 2.0
    iterations: number = 60
    pan_real: number = 0.0
    pan_imag: number = 0.0

    color_map_code: string = "";

    set_AST(initial_value_AST: Expr.Expression, equation_AST: Expr.Expression) {
        this.initial_value_AST = initial_value_AST
        this.equation_AST = equation_AST
    }

    init_variables() {
        let var_map: Map<string, UserVar> = new Map()

        this.get_vars(this.initial_value_AST, var_map)
        this.get_vars(this.equation_AST, var_map)

        for (let [k, v] of var_map) {
            if (this.variables.has(k))
                this.variables.get(k)!.id = v.id
            else
                this.variables.set(k, v)
        }

        for (let [k, _] of this.variables)
            if (!var_map.has(k))
                this.variables.delete(k)
    }

    get_vars(AST: Expr.Expression, map: Map<string, UserVar>) {
        if (AST instanceof Expr.Unary) {
            this.get_vars((AST as Expr.Unary).inner, map)
        } else if (AST instanceof Expr.Binary) {
            this.get_vars((AST as Expr.Binary).left, map)
            this.get_vars((AST as Expr.Binary).right, map)
        } else if (AST instanceof Expr.Variable) {
            if (!map.has((AST as Expr.Variable).identifier.value) && (AST as Expr.Variable).identifier.type == TokenType.IDENTIFIER) {
                map.set((AST as Expr.Variable).identifier.value, new UserVar(map.size, 0.0, 0.0))
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

    get_shader_code(): string {
        return `
struct MyUniforms {
    color: vec4f,
    t: vec2f,
    c: vec2f,
    width: f32,
    height: f32,
    zoom: f32,
    iterations: f32,
    pan: vec2f,
    ${this.get_user_var_struct_fields()}
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

fn color_map(t: f32) -> vec3f {
    ${this.color_map_code}
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    var aspect_ratio: f32 = uniforms.width / uniforms.height;

    var x: vec2f = vec2f(
        ((position.x / uniforms.width) * 2.0 - 1.0 + uniforms.pan.x) * aspect_ratio * uniforms.zoom,
        ((position.y / uniforms.height) * 2.0 - 1.0 + uniforms.pan.y) * uniforms.zoom
    );

    var z: vec2f = ${this.get_code(this.initial_value_AST)};

    for (var i: i32 = 0; i < 50; i++) {
        z = ${this.get_code(this.equation_AST)};
        var mag2: f32 = dot(z, z);
        if (mag2 > 4.0) {
            return vec4(color_map((f32(i) + 1.0 - log2(log2(mag2))) / uniforms.iterations), 1.0);
        }
    }

    return vec4(0.0, 0.0, 0.0, 1.0);
}`
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
            return `vec2f(${AST.value.value}, 0.0)`
        } else if (AST instanceof Expr.Variable) {
            switch (AST.identifier.type) {
                case TokenType.IDENTIFIER: return `uniforms.u${this.variables.get(AST.identifier.value)!.id}`
                case TokenType.PARAMETER: {
                    if (AST.identifier.value === "t" || AST.identifier.value === "c") {
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
        for (let [_, v] of this.variables) {
            out += `\tu${v.id}: vec2f,\n`
        }
        return out;
    }

    insert_user_var_sliders() {
        let var_sliders = document.getElementById("var-sliders")
        var_sliders?.replaceChildren()
        for (let [k, v] of this.variables) {
            var_sliders?.insertAdjacentHTML("beforeend", `
            <div class="var-slider">
                <p class="var-identifier"><span class="latex">${k}</span></p>
                <p class="var-display" id="var-display-${k}">${v.real} + ${v.imag}i</p>
                <p class="slider-label">Real</p>
                <input type="range" id="${k}_real" value="${v.real}" min="-2" max="2" step="0.001">
                <p class="slider-label">Imag</p>
                <input type="range" id="${k}_imag" value="${v.imag}" min="-2" max="2" step="0.001">
            </div>
            `) 
            
            const self: AppState = this as AppState

            (document.getElementById(`${k}_real`) as HTMLInputElement)?.addEventListener("input", function() {
                let user_var = self.variables.get(`${k}`)
                let user_var_display = document.getElementById(`var-display-${k}`)
                if (user_var != null) {
                    user_var.real = Number.parseFloat((this as HTMLInputElement).value)
                }
                if (user_var_display != null) {
                    user_var_display.innerText = `${v.real} + ${v.imag}i`;
                }
            });

            (document.getElementById(`${k}_imag`) as HTMLInputElement)?.addEventListener("input", function() {
                let user_var = self.variables.get(`${k}`)
                let user_var_display = document.getElementById(`var-display-${k}`)
                if (user_var != null) {
                    user_var.imag = Number.parseFloat((this as HTMLInputElement).value)
                }
                if (user_var_display != null) {
                    user_var_display.innerText = `${v.real} + ${v.imag}i`;
                }
            });
        }
    }

    update_var_sliders() {
        for (let [k, v] of this.variables) {
            let user_var_display = document.getElementById(`var-display-${k}`)
            let user_var_slider_real = document.getElementById(`${k}_real`) as HTMLInputElement
            let user_var_slider_imag = document.getElementById(`${k}_imag`) as HTMLInputElement
            if (user_var_display != null) {
                user_var_display.innerText = `${v.real} + ${v.imag}i`;
            }
            user_var_slider_real.value = v.real.toString()
            user_var_slider_imag.value= v.imag.toString()
        }
    }

    update_uniform_array(uniforms: Float32Array) {
        uniforms.set([0.0, 1.0, 0.0, 1.0], 0); // Color
        uniforms.set([performance.now() / 1000, 0.0], 4) // Time
        uniforms.set([this.c_real, this.c_imag], 6)
        uniforms.set([this.zoom], 10)
        uniforms.set([this.iterations], 11)
        uniforms.set([this.pan_real, this.pan_imag], 12)
        let count = 0
        for (let [_, v] of this.variables) {
            uniforms.set([v.real, v.imag], 14 + 2 * count)
            count += 1
        }
    }

    set_color_map(color_map_code: string) {
        this.color_map_code = color_map_code;
    }
}