struct MyUniforms {
    color: vec4f,
    time: f32,
    width: f32,
    height: f3
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

// // See https://mathworld.wolfram.com/ComplexDivision.html
// fn complex_div(a: vec2f, b: vec2f) -> vec2f {
//     return vec2f(
//         (a.x * b.x + a.y * b.y) / (b.x * b.x + b.y * b.y),
//         (a.y * b.x - a.x * b.y) / (b.x * b.x + b.y * b.y)
//     );
// }

// // See https://mathworld.wolfram.com/ComplexExponentiation.html
// fn complex_pow(a: vec2f, b: vec2f) -> vec2f {
//     var arg: f32 = atan2(a.y, a.x);
//     var inner: f32 = b.x * arg + 0.5 * b.y * log(a.x * a.x + a.y * a.y);

//     return pow(a.x * a.x + a.y * a.y, b.x / 2.0) * exp(-b.y * arg) * vec2f(
//         cos(inner),
//         sin(inner)
//     );
// }

// fn complex_sqrt(a: vec2f) -> vec2f {
//     return complex_pow(a, vec2f(0.5, 0.0));
// }

// // See https://proofwiki.org/wiki/Sine_of_Complex_Number
// fn complex_sin(a: vec2f) -> vec2f {
//     return vec2f(
//         sin(a.x) * cosh(a.y),
//         cos(a.x) * sinh(a.y)
//     );
// }

// // See https://proofwiki.org/wiki/Cosine_of_Complex_Number
// fn complex_cos(a: vec2f) -> vec2f {
//     return vec2f(
//         cos(a.x) * cosh(a.y),
//         sin(a.x) * sinh(a.y)
//     );
// }

// // See https://proofwiki.org/wiki/Tangent_of_Complex_Number
// fn complex_tan(a: vec2f) -> vec2f {
//     return complex_div(complex_sin(a), complex_cos(a));
// }

// // See https://proofwiki.org/wiki/Definition:Natural_Logarithm/Complex
// fn complex_ln(a: vec2f) -> vec2f {
//     return vec2f(
//         0.5 * log(a.x * a.x + b.x * b.x),
//         atan2(a.y, a.x)
//     );
// }

// fn complex_log(a: vec2f) -> vec2f {
//     return complex_ln(a) / log(10);
// }

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    var starting_color: vec3f = vec3f(0.0, 0.0, 0.0);
    var ending_color: vec3f = vec3f(0.4, 0.8, 0.6);
    var aspect_ratio: f32 = uniforms.width / uniforms.height;
    var iterations: i32 = 40;
    var zoom: f32 = 2.0;

    var x: vec2f = vec2f(
        ((position.x / uniforms.width) * 2.0 - 1.0) * aspect_ratio * zoom,
        ((position.y / uniforms.height) * 2.0 - 1.0) * zoom
    );

    var z: vec2f = x;

    var c: vec2f = 0.8 * vec2f(cos(uniforms.time), sin(uniforms.time));

    var total: f32 = 0.0;
    var color: vec3f = vec3f(0.4, 0.8, 0.6);
    var escaped: bool = false;

    for (var i: i32 = 0; i < iterations; i++) {
        z = complex_mult(z, z) + c;
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

    return vec4(color, 1.0);
}