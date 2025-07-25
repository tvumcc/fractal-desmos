var canvas = document.getElementById("webgpu_canvas") as HTMLCanvasElement
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
window.addEventListener("resize", () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
})


export function parse(equation: string) {
    console.log(equation)
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