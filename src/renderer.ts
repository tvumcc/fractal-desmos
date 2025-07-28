export class Renderer {
    device!: GPUDevice
    canvas: HTMLCanvasElement
    canvas_context!: GPUCanvasContext | null
    canvas_texture_format!: GPUTextureFormat

    uniform_buffer!: GPUBuffer
    bind_group!: GPUBindGroup
    shader_module!: GPUShaderModule
    pipeline!: GPURenderPipeline

    vertex_buffer!: GPUBuffer
    vertex_buffer_layout!: GPUVertexBufferLayout

    vertices = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
         1.0, 1.0,

        -1.0, -1.0,
         1.0, 1.0,
        -1.0, 1.0,
    ]);

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
    }

    async init_webgpu() {
        if (!navigator.gpu) {
            throw new Error("WebGPU Not Supported")
        }

        let adapter = await navigator.gpu.requestAdapter() as GPUAdapter
        this.device = await adapter.requestDevice() as GPUDevice
        this.canvas_context = this.canvas.getContext("webgpu")
        this.canvas_texture_format = navigator.gpu.getPreferredCanvasFormat();

        this.canvas_context?.configure({
            device: this.device,
            format: this.canvas_texture_format
        })
    }

    init_vertex_buffer() {
        this.vertex_buffer = this.device.createBuffer({
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        }) as GPUBuffer
        this.device.queue.writeBuffer(this.vertex_buffer, 0, this.vertices)
        this.vertex_buffer_layout = {
            arrayStride: 8,
            attributes: [{
                format: "float32x2",
                offset: 0,
                shaderLocation: 0
            }]

        } as GPUVertexBufferLayout
    }

    set_shader_code(shader_code: string) {
        this.shader_module = this.device.createShaderModule({
            code: shader_code
        }) as GPUShaderModule
        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: this.shader_module,
                entryPoint: "vs_main",
                buffers: [this.vertex_buffer_layout]
            },
            fragment: {
                module: this.shader_module,
                entryPoint: "fs_main",
                targets: [{format: this.canvas_texture_format}]
            }
        }) as GPURenderPipeline
    }

    set_uniforms(uniforms: Float32Array<ArrayBuffer>) {
        this.uniform_buffer = this.device.createBuffer({
            label: "uniform buffer",
            size: uniforms.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST 
        }) as GPUBuffer
        this.device.queue.writeBuffer(this.uniform_buffer, 0, uniforms);

        this.bind_group = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.uniform_buffer }
            }]
        }) as GPUBindGroup
    }

    change_uniforms(uniforms: Float32Array<ArrayBuffer>) {
        this.device.queue.writeBuffer(this.uniform_buffer, 0, uniforms);
    }

    render() {
        if (!this.canvas_context) {
            throw new Error("WebGPU Context is null")
        }

        let encoder: GPUCommandEncoder = this.device.createCommandEncoder()
        let pass: GPURenderPassEncoder = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.canvas_context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: {r: 1.0, g: 0.0, b: 0.0, a: 1.0},
                storeOp: "store"
            }]
        })
        pass.setPipeline(this.pipeline)
        pass.setVertexBuffer(0, this.vertex_buffer)
        pass.setBindGroup(0, this.bind_group)
        pass.draw(this.vertices.length / 2)
        pass.end()
        this.device.queue.submit([encoder.finish()])
    }
}