#define WEBGPU_CPP_IMPLEMENTATION
#include <webgpu/webgpu.hpp>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#ifdef WEBGPU_BACKEND_WGPU
#include <webgpu/wgpu.h>
#endif

#include <GLFW/glfw3.h>
#include <glfw3webgpu.h>

#include <iostream>
#include <format>
#include <vector>
#include <array>

const char* shader_source = R"(
struct VertexInput {
    @location(0) position: vec2f,
    @location(1) color: vec3f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
};

struct MyUniforms {
    color: vec4f,
    time: f32,
};

@group(0) @binding(0) var<uniform> uMyUniforms: MyUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4f(in.position.x + (0.5 * cos(uMyUniforms.time)), in.position.y + (0.5 * sin(uMyUniforms.time)), 0.0, 1.0);
    out.color = in.color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let color = vec3(in.position.x / 800.0, in.position.y / 600.0, 0.0);
    let linear_color = pow(color, vec3f(2.2));
    return vec4f(linear_color, 1.0);
}
)";


wgpu::Adapter request_adapter_sync(wgpu::Instance instance, const wgpu::RequestAdapterOptions& options) {
    struct Context {
        wgpu::Adapter adapter = nullptr;
        bool request_ended = false;
    };
    Context context;

    instance.requestAdapter(options, [&context](wgpu::RequestAdapterStatus status, wgpu::Adapter adapter, const char* message) {
        if (status == wgpu::RequestAdapterStatus::Success)
            context.adapter = adapter;
        else
            std::cout << std::format("Failed to acquire WebGPU adapter: {}\n", message);
        context.request_ended = true;
    });

    #ifdef __EMSCRIPTEN__
    while (!user_data.request_ended) {
        emscripten_sleep(100)
    }
    #endif

    return context.adapter;
}

wgpu::Device request_device_sync(wgpu::Adapter adapter, const wgpu::DeviceDescriptor& desc) {
    struct Context {
        wgpu::Device device = nullptr;
        bool request_ended = false;
    };
    Context context;

    adapter.requestDevice(desc, [&context](wgpu::RequestDeviceStatus status, wgpu::Device device, const char* message){
        if (status == wgpu::RequestDeviceStatus::Success)
            context.device = device;
        else
            std::cout << std::format("Failed to acquire WebGPU device: {}\n", message);
    });

    #ifdef __EMSCRIPTEN__
    while (!user_data.request_ended) {
        emscripten_sleep(100)
    }
    #endif

    return context.device;
}

class Application {
public:
    bool initialize() {
        glfwInit();
        glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);
        glfwWindowHint(GLFW_RESIZABLE, GLFW_FALSE);
        window = glfwCreateWindow(800, 600, "WebGPU Test", nullptr, nullptr);

        wgpu::InstanceDescriptor instance_desc{};
        wgpu::Instance instance = wgpu::createInstance(instance_desc); // REMINDER: might not work in Emscripten??
        
        if (!instance) {
            std::cout << "Failed to initialize WebGPU\n";
            return false;
        }

        surface = glfwGetWGPUSurface(instance, window); 
        wgpu::RequestAdapterOptions adapter_options{};
        adapter_options.compatibleSurface = surface;
        wgpu::Adapter adapter = request_adapter_sync(instance, adapter_options);

        wgpu::DeviceDescriptor device_desc{}; // REMINDER: maybe should add some error checking callback functions
        wgpu::RequiredLimits required_limits = get_required_limits(adapter);
        device_desc.requiredLimits = &required_limits;
        device = request_device_sync(adapter, device_desc);
        queue = device.getQueue();

        surface_format = surface.getPreferredFormat(adapter); 
        wgpu::SurfaceConfiguration config{};
        config.width = 800;
        config.height = 600;
        config.format = surface_format;
        config.viewFormatCount = 0;
        config.viewFormats = nullptr;
        config.usage = wgpu::TextureUsage::RenderAttachment;
        config.device = device;
        config.presentMode = wgpu::PresentMode::Fifo;
        config.alphaMode = wgpu::CompositeAlphaMode::Auto;

        surface.configure(config);
        instance.release();
        adapter.release();

        init_pipeline();
        init_buffers();
        init_bind_groups();

        return true;
    }

    void terminate() {
        uniform_buffer.release();
        vertex_buffer.release();
        index_buffer.release();

        layout.release();
        bind_group_layout.release();
        bind_group.release();

        pipeline.release();
        surface.unconfigure();
        surface.release();
        queue.release();
        device.release();

        glfwDestroyWindow(window);
        glfwTerminate();
    }

    void main_loop() {
        glfwPollEvents();
        float time = static_cast<float>(glfwGetTime());
        queue.writeBuffer(uniform_buffer, offsetof(MyUniforms, time), &time, sizeof(float));

        auto [surface_texture, target_view] = get_next_surface_view_data();
        if (!target_view) return;

        wgpu::CommandEncoderDescriptor encoder_desc{};
        encoder_desc.label = "my encoder";
        wgpu::CommandEncoder encoder = device.createCommandEncoder(encoder_desc);

        wgpu::RenderPassColorAttachment render_pass_color_attachment = {};
        render_pass_color_attachment.view = target_view;
        render_pass_color_attachment.resolveTarget = nullptr;
        render_pass_color_attachment.loadOp = wgpu::LoadOp::Clear;
        render_pass_color_attachment.storeOp = wgpu::StoreOp::Store;
        render_pass_color_attachment.clearValue = wgpu::Color {0.9, 0.1, 0.2, 1.0};
        // #ifndef WEBGPU_BACKEND_WGPU
        // render_pass_color_attachment.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
        // #endif

        wgpu::RenderPassDescriptor render_pass_desc{};
        render_pass_desc.colorAttachmentCount = 1;
        render_pass_desc.colorAttachments = &render_pass_color_attachment;
        render_pass_desc.depthStencilAttachment = nullptr;
        render_pass_desc.timestampWrites = nullptr;

        wgpu::RenderPassEncoder render_pass = encoder.beginRenderPass(render_pass_desc);
        render_pass.setPipeline(pipeline);
        render_pass.setVertexBuffer(0, vertex_buffer, 0, vertex_buffer.getSize());
        render_pass.setIndexBuffer(index_buffer, wgpu::IndexFormat::Uint32, 0, index_buffer.getSize());
        render_pass.setBindGroup(0, bind_group, 0, nullptr);
        render_pass.drawIndexed(index_count, 1, 0, 0, 0);
        render_pass.end();
        render_pass.release();

        wgpu::CommandBufferDescriptor command_buffer_desc{};
        command_buffer_desc.label = "my cmd buffer";
        wgpu::CommandBuffer command = encoder.finish(command_buffer_desc);
        encoder.release();
        queue.submit(1, &command);
        command.release();

        target_view.release();


        #ifndef __EMSCRIPTEN__
        surface.present();
        #endif

        #if defined(WEBGPU_BACKEND_DAWN)
        device.tick();
        #elif defined(WEBGPU_BACKEND_WGPU)
        wgpuDevicePoll((WGPUDevice)device, false, nullptr);
        #endif
    }

    bool is_running() {
        return !glfwWindowShouldClose(window);
    }
private:
    GLFWwindow* window;
    wgpu::Device device = nullptr;
    wgpu::Queue queue = nullptr;
    wgpu::Surface surface = nullptr;
    wgpu::TextureFormat surface_format = wgpu::TextureFormat::Undefined;
    wgpu::RenderPipeline pipeline = nullptr;

    wgpu::Buffer uniform_buffer = nullptr;
    wgpu::Buffer vertex_buffer = nullptr;
    wgpu::Buffer index_buffer = nullptr;
    uint32_t index_count;

    wgpu::PipelineLayout layout = nullptr;
    wgpu::BindGroupLayout bind_group_layout = nullptr;
    wgpu::BindGroup bind_group = nullptr;

    struct MyUniforms {
        std::array<float, 4> color;
        float time;
        float _padding[3];
    };
    static_assert(sizeof(MyUniforms) % 16 == 0);

    void init_pipeline() {
        wgpu::ShaderModuleDescriptor shader_desc{};
        #ifdef WEBGPU_BACKEND_WGPU
        shader_desc.hintCount = 0;
        shader_desc.hints = nullptr;
        #endif

        wgpu::ShaderModuleWGSLDescriptor shader_code_desc{};
        shader_code_desc.code = shader_source;
        shader_code_desc.chain.next = nullptr;
        shader_code_desc.chain.sType = wgpu::SType::ShaderModuleWGSLDescriptor;
        shader_desc.nextInChain = &shader_code_desc.chain;

        wgpu::ShaderModule shader_module = wgpuDeviceCreateShaderModule(device, &shader_desc);

        // Setup the Render Pipeline
        wgpu::RenderPipelineDescriptor pipeline_desc{};

        // 1. Vertex State
        wgpu::VertexBufferLayout vertex_buffer_layout{};
        std::vector<wgpu::VertexAttribute> vertex_attributes(2);
        // Vertex positions
        vertex_attributes[0].shaderLocation = 0;
        vertex_attributes[0].format = wgpu::VertexFormat::Float32x2;
        vertex_attributes[0].offset = 0;

        // Vertex colors
        vertex_attributes[1].shaderLocation = 1;
        vertex_attributes[1].format = wgpu::VertexFormat::Float32x3;
        vertex_attributes[1].offset = 2 * sizeof(float);

        vertex_buffer_layout.attributeCount = static_cast<uint32_t>(vertex_attributes.size());
        vertex_buffer_layout.attributes = vertex_attributes.data();
        vertex_buffer_layout.arrayStride = 5 * sizeof(float);
        vertex_buffer_layout.stepMode = wgpu::VertexStepMode::Vertex;

        pipeline_desc.vertex.bufferCount = 1;
        pipeline_desc.vertex.buffers = &vertex_buffer_layout;

        pipeline_desc.vertex.module = shader_module;
        pipeline_desc.vertex.entryPoint = "vs_main";
        pipeline_desc.vertex.constantCount = 0;
        pipeline_desc.vertex.constants = nullptr;

        // 2. Primitive State
        pipeline_desc.primitive.topology = wgpu::PrimitiveTopology::TriangleList;
        pipeline_desc.primitive.stripIndexFormat = wgpu::IndexFormat::Undefined;
        pipeline_desc.primitive.frontFace = wgpu::FrontFace::CCW;
        pipeline_desc.primitive.cullMode = wgpu::CullMode::None;

        // 3. Fragment State
        wgpu::FragmentState fragment_state{};
        fragment_state.module = shader_module;
        fragment_state.entryPoint = "fs_main";
        fragment_state.constantCount = 0;
        fragment_state.constants = nullptr;

        // 4. Blending State
        wgpu::BlendState blend_state{};
        blend_state.color.srcFactor = wgpu::BlendFactor::SrcAlpha;
        blend_state.color.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        blend_state.color.operation = wgpu::BlendOperation::Add;
        blend_state.alpha.srcFactor = wgpu::BlendFactor::Zero;
        blend_state.alpha.dstFactor = wgpu::BlendFactor::One;
        blend_state.alpha.operation = wgpu::BlendOperation::Add;

        wgpu::ColorTargetState color_target{};
        color_target.format = surface_format;
        color_target.blend = &blend_state;
        color_target.writeMask = wgpu::ColorWriteMask::All;

        fragment_state.targetCount = 1;
        fragment_state.targets = &color_target;
        pipeline_desc.fragment = &fragment_state;

        // 5. Depth/Stencil State
        pipeline_desc.depthStencil = nullptr;

        // 6. Multi-sampling
        pipeline_desc.multisample.count = 1;
        pipeline_desc.multisample.mask = ~0u;
        pipeline_desc.multisample.alphaToCoverageEnabled = false;

        // Pipeline Layout (memory layout for buffers/textures)
        wgpu::BindGroupLayoutEntry binding_layout = wgpu::Default;
        binding_layout.binding = 0;
        binding_layout.visibility = wgpu::ShaderStage::Vertex | wgpu::ShaderStage::Fragment;
        binding_layout.buffer.type = wgpu::BufferBindingType::Uniform;
        binding_layout.buffer.minBindingSize = sizeof(MyUniforms);

        wgpu::BindGroupLayoutDescriptor bind_group_layout_desc{};
        bind_group_layout_desc.entryCount = 1;
        bind_group_layout_desc.entries = &binding_layout;
        bind_group_layout = device.createBindGroupLayout(bind_group_layout_desc);

        wgpu::PipelineLayoutDescriptor layout_desc{};
        layout_desc.bindGroupLayoutCount = 1;
        layout_desc.bindGroupLayouts = reinterpret_cast<WGPUBindGroupLayout*>(&bind_group_layout);
        layout = device.createPipelineLayout(layout_desc);

        pipeline_desc.layout = layout;
        pipeline = device.createRenderPipeline(pipeline_desc);

        shader_module.release();
    }

    void init_buffers() {
        std::vector<float> vertex_data = {
            -0.5, -0.5,   1.0, 0.0, 0.0,
            +0.5, -0.5,   0.0, 1.0, 0.0,
            +0.5, +0.5,   0.0, 0.0, 1.0,
            -0.5, +0.5,   1.0, 1.0, 0.0
        };

        std::vector<uint32_t> index_data = {
            0, 1, 2,
            0, 2, 3
        };

        index_count = static_cast<uint32_t>(index_data.size());

        wgpu::BufferDescriptor buffer_desc{};
        buffer_desc.nextInChain = nullptr;
        buffer_desc.size = vertex_data.size() * sizeof(float);
        buffer_desc.usage = wgpu::BufferUsage::CopyDst | wgpu::BufferUsage::Vertex;
        buffer_desc.mappedAtCreation = false;
        vertex_buffer = device.createBuffer(buffer_desc);
        queue.writeBuffer(vertex_buffer, 0, vertex_data.data(), buffer_desc.size);

        buffer_desc.size = index_data.size() * sizeof(uint32_t);
        buffer_desc.usage = wgpu::BufferUsage::CopyDst | wgpu::BufferUsage::Index;
        index_buffer = device.createBuffer(buffer_desc);

        queue.writeBuffer(index_buffer, 0, index_data.data(), buffer_desc.size);

        buffer_desc.size = sizeof(MyUniforms);
        buffer_desc.usage = wgpu::BufferUsage::CopyDst | wgpu::BufferUsage::Uniform;
        uniform_buffer = device.createBuffer(buffer_desc);

        MyUniforms uniforms;
        uniforms.time = 1.0f;
        uniforms.color = {0.0f, 1.0f, 0.0f, 1.0f};
        queue.writeBuffer(uniform_buffer, 0, &uniforms, sizeof(MyUniforms));
    }

    void init_bind_groups() {
        wgpu::BindGroupEntry binding{};
        binding.binding = 0;
        binding.buffer = uniform_buffer;
        binding.offset = 0;
        binding.size = sizeof(MyUniforms);

        wgpu::BindGroupDescriptor bind_group_desc{};
        bind_group_desc.layout = bind_group_layout;
        bind_group_desc.entryCount = 1;
        bind_group_desc.entries = &binding;
        bind_group = device.createBindGroup(bind_group_desc);
    }

    wgpu::RequiredLimits get_required_limits(wgpu::Adapter adapter) const {
        wgpu::SupportedLimits supported_limits;
        adapter.getLimits(&supported_limits);

        wgpu::RequiredLimits required_limits = wgpu::Default;

        required_limits.limits.maxVertexAttributes = 2;
        required_limits.limits.maxVertexBuffers = 1;
        required_limits.limits.maxBufferSize = 6 * 5 * sizeof(float);
        required_limits.limits.maxVertexBufferArrayStride = 5 * sizeof(float);
        required_limits.limits.maxInterStageShaderComponents = 3;
        required_limits.limits.maxTextureDimension2D = 2000;

        required_limits.limits.maxBindGroups = 1;
        required_limits.limits.maxUniformBuffersPerShaderStage = 1;
        required_limits.limits.maxUniformBufferBindingSize = 16 * 4;

        required_limits.limits.minUniformBufferOffsetAlignment = supported_limits.limits.minUniformBufferOffsetAlignment;
        required_limits.limits.minStorageBufferOffsetAlignment = supported_limits.limits.minStorageBufferOffsetAlignment;

        return required_limits;
    }

    std::pair<wgpu::SurfaceTexture, wgpu::TextureView> get_next_surface_view_data() {
        wgpu::SurfaceTexture surface_texture;
        surface.getCurrentTexture(&surface_texture);

        if (surface_texture.status != wgpu::SurfaceGetCurrentTextureStatus::Success)
            return {surface_texture, nullptr};
            
        wgpu::Texture texture = surface_texture.texture;

        wgpu::TextureViewDescriptor view_desc;
        view_desc.nextInChain = nullptr;
        view_desc.label = "Surface texture view";
        view_desc.format = texture.getFormat();
        view_desc.dimension = wgpu::TextureViewDimension::_2D;
        view_desc.baseMipLevel = 0;
        view_desc.mipLevelCount = 1;
        view_desc.baseArrayLayer = 0;
        view_desc.arrayLayerCount = 1;
        view_desc.aspect = wgpu::TextureAspect::All;
        wgpu::TextureView target_view = texture.createView(view_desc);

        #ifndef WEBGPU_BACKEND_WGPU
        wgpu::Texture(surface_texture.texture).release();
        #endif

        return {surface_texture, target_view};
    }
};

int main() {
    Application app;
    if (!app.initialize()) return -1;

    #ifdef __EMSCRIPTEN__
    auto callback = [](void* arg) {
        Application* p_app = reinterpret_cast<Application*>(arg);
        p_app->main_loop();
    }
    emscripten_set_main_loop_arg(callback, &app, 0, true);
    #else
    while (app.is_running()) {
        app.main_loop();
    }
    #endif

    app.terminate();
}