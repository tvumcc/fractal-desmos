struct MyUniforms {
    color: vec4f,
    time: f32,
    width: f32,
    height: f32
};

@group(0) @binding(0) var<uniform> uniforms: MyUniforms;

@vertex
fn vs_main(@location(0) pos: vec2f) -> @builtin(position) vec4f {
    return vec4f(pos.x, pos.y, 0.0, 1.0);
} 

fn mult(a: vec2f, b: vec2f) -> vec2f {
    return vec2f(
        a.x * b.x - a.y * b.y,
        a.x * b.y + a.y * b.x
    );
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    var starting_color: vec3f = vec3f(0.0, 0.0, 0.0);
    var ending_color: vec3f = vec3f(0.4, 0.8, 0.6);
    var aspect_ratio: f32 = uniforms.width / uniforms.height;
    var iterations: i32 = 40;
    var zoom: f32 = 2.0;

    var z: vec2f = vec2f(
        ((position.x / uniforms.width) * 2.0 - 1.0) * aspect_ratio * zoom,
        ((position.y / uniforms.height) * 2.0 - 1.0) * zoom
    );

    var c: vec2f = 0.8 * vec2f(cos(uniforms.time), sin(uniforms.time));

    var total: f32 = 0.0;
    var color: vec3f = vec3f(0.4, 0.8, 0.6);
    var escaped: bool = false;

    for (var i: i32 = 0; i < iterations; i++) {
        z = mult(z, z) + c;
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