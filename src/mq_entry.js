import { parse, state } from "./main.ts"

let MQ = MathQuill.getInterface(2)
let symbols = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omikron pi rho sigma tau upsilon chi psi omega"
let math_fields = document.getElementsByClassName("latex");
for (let math_field of math_fields)
    MQ.StaticMath(math_field)

let z0_entry = MQ.MathField(document.getElementById("z0"), {
    supSubsRequireOperand: true,
    autoCommands: "sqrt " + symbols,
    handlers: {
        edit: function () {
            parse(z0_entry.latex(), equation_entry.latex())
            let math_fields = document.getElementsByClassName("latex");
            for (let math_field of math_fields)
                MQ.StaticMath(math_field)
        }
    }
})

let equation_entry = MQ.MathField(document.getElementById("fz"), {
    supSubsRequireOperand: true,
    autoCommands: "sqrt " + symbols,
    handlers: {
        edit: function () {
            parse(z0_entry.latex(), equation_entry.latex())
            let math_fields = document.getElementsByClassName("latex");
            for (let math_field of math_fields)
                MQ.StaticMath(math_field)
        }
    }
})

class Preset {
    initial_value
    equation
    variables

    constructor(initial_value, equation, variables) {
        this.initial_value = initial_value;
        this.equation = equation;
        if (variables) {
            this.variables = variables;
        }
    }
}

let presets = new Map([
    ["time-julia-set", new Preset("x", "z^2+a\\left(\\cos\\left(t\\right)+i\\sin\\left(t\\right)\\right)", new Map([["a", [0.9, 0.0]]]))],
    ["mouse-julia-set", new Preset("ax", "z^2 + c", new Map([["a", [1.0, 0.0]]]))],
    ["star-julia", new Preset("x", "z^5 + a", new Map([["a", [0.765, 0.535]]]))],
    ["inverse-julia", new Preset("x", "\\frac{1}{z^2} + a", new Map([["a", [0.016, 0.535]]]))],
    ["mandelbrot-set", new Preset("0", "z^2 + x", new Map())],
    ["sine-mandelbrot", new Preset("0", "\\sin\\left(z^2+x\\right)", new Map())],
    ["moth", new Preset("x", "z^x+z^z", new Map())],
    ["web", new Preset("x^5", "\\frac{1}{4}\\sin\\left(z^2+\\ln\\left(z\\right)+\\cos\\left(2t\\right)+i\\sin\\left(2t\\right)\\right)", new Map())]
])

let preset_div = document.getElementById("presets")
for (let button of preset_div.children) {
    button.addEventListener("click", () => set_preset(button.id))
}

function set_preset(preset_str) {
    if (presets.has(preset_str)) {
        let preset = presets.get(preset_str)

        parse(preset.initial_value, preset.equation)
        z0_entry.latex(preset.initial_value)
        equation_entry.latex(preset.equation)

        if (preset.variables) {
            for (let [k, v] of preset.variables) {
                if (state.variables.has(k)) {
                    state.variables.get(k).real = v[0]
                    state.variables.get(k).imag = v[1]
                    state.update_var_sliders()
                }
            }
        }
    }
}
