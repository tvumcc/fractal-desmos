#define WEBGPU_CPP_IMPLEMENTATION
#define WEBGPU_BACKEND_WGPU
#include <webgpu/webgpu.h>
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
    out.position = vec4f(in.position.x, in.position.y + (0.5 * sin(uMyUniforms.time) + 0.5), 0.0, 1.0);
    out.color = in.color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let color = in.color * uMyUniforms.color.rgb;
    let linear_color = pow(color, vec3f(2.2));
    return vec4f(linear_color, 1.0);
}
)";

WGPUAdapter request_adapter_sync(WGPUInstance instance, const WGPURequestAdapterOptions* options) {
    struct UserData {
        WGPUAdapter adapter = nullptr;
        bool request_ended = false;
    };
    UserData user_data;

    auto on_adapter_request_ended = [](WGPURequestAdapterStatus status, WGPUAdapter adapter, const char* message, void* p_user_data) {
        UserData& user_data = *reinterpret_cast<UserData*>(p_user_data);
        if (status == WGPURequestAdapterStatus_Success) {
            user_data.adapter = adapter;
        } else {
            std::cout << std::format("Failed to acquire WebGPU adapter: {}\n", message);
        }
        user_data.request_ended = true;
    };

    wgpuInstanceRequestAdapter(instance, options, on_adapter_request_ended, (void*)&user_data);

#ifdef __EMSCRIPTEN__
    while (!user_data.request_ended) {
        emscripten_sleep(100)
    }
#endif

    return user_data.adapter;
}

WGPUDevice request_device_sync(WGPUAdapter adapter, const WGPUDeviceDescriptor* descriptor) {
    struct UserData {
        WGPUDevice device = nullptr;
        bool request_ended = false;
    };
    UserData user_data;

    auto on_device_requested = [](WGPURequestDeviceStatus status, WGPUDevice device, const char* message, void* p_user_data) {
        UserData& user_data = *reinterpret_cast<UserData*>(p_user_data);
        if (status == WGPURequestDeviceStatus_Success) {
            user_data.device = device;
        } else {
            std::cout << std::format("Failed to acquire WebGPU device: {}\n", message);
        }
        user_data.request_ended = true;
    };

    wgpuAdapterRequestDevice(adapter, descriptor, on_device_requested, (void*)&user_data);

#ifdef __EMSCRIPTEN__
    while (!user_data.request_ended) {
        emscripten_sleep(100)
    }
#endif

    return user_data.device;
}

class Application {
public:
    bool initialize() {
        glfwInit();
        glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);
        glfwWindowHint(GLFW_RESIZABLE, GLFW_FALSE);
        window = glfwCreateWindow(800, 600, "WebGPU Test", nullptr, nullptr);

        WGPUInstanceDescriptor desc = {};
        desc.nextInChain = nullptr;

    #ifdef WEBGPU_BACKEND_EMSCRIPTEN
        WGPUInstance instance = wgpuCreateInstance(nullptr);
    #else
        WGPUInstance instance = wgpuCreateInstance(&desc);
    #endif

        if (!instance) {
            std::cout << "Failed to initialize WebGPU\n";
            return false;
        }

        surface = glfwGetWGPUSurface(instance, window);
        WGPURequestAdapterOptions adapter_options = {};
        adapter_options.nextInChain = nullptr;
        adapter_options.compatibleSurface = surface;
        WGPUAdapter adapter = request_adapter_sync(instance, &adapter_options);

        WGPUSupportedLimits supported_limits = {};
        supported_limits.nextInChain = nullptr;
        wgpuAdapterGetLimits(adapter, &supported_limits);

        WGPUDeviceDescriptor device_descriptor = {};
        device_descriptor.deviceLostCallback = [](WGPUDeviceLostReason reason, char const *message, void * /* pUserData */) {
            std::cout << "Device lost: reason " << reason;
            if (message)
                std::cout << " (" << message << ")";
            std::cout << std::endl;
        };

        WGPURequiredLimits required_limits = get_required_limits(adapter);
        device_descriptor.requiredLimits = &required_limits;
        device = request_device_sync(adapter, &device_descriptor);

        surface_format = wgpuSurfaceGetPreferredFormat(surface, adapter);
        WGPUSurfaceConfiguration config = {};
        config.nextInChain = nullptr;
        config.width = 800;
        config.height = 600;
        config.format = surface_format;
        config.viewFormatCount = 0;
        config.viewFormats = nullptr;
        config.usage = WGPUTextureUsage_RenderAttachment;
        config.device = device;
        config.presentMode = WGPUPresentMode_Fifo;
        config.alphaMode = WGPUCompositeAlphaMode_Auto;

        wgpuSurfaceConfigure(surface, &config);
        wgpuInstanceRelease(instance);
        wgpuAdapterRelease(adapter);

        auto on_device_error = [](WGPUErrorType type, const char* message, void*) {
            std::cout << "Uncaptured device error: type " << type;
            if (message) std::cout << " (" << message << ")";
            std::cout << "\n";
        };
        wgpuDeviceSetUncapturedErrorCallback(device, on_device_error, nullptr);

        queue = wgpuDeviceGetQueue(device);
        auto on_queue_work_done = [](WGPUQueueWorkDoneStatus status, void*) {
            std::cout << "Queued work finished with status: " << status << "\n";
        };
        wgpuQueueOnSubmittedWorkDone(queue, on_queue_work_done, nullptr);

        init_pipeline();
        init_buffers();
        init_bind_groups();

        return true;
    } 

    void terminate() {
        wgpuBufferRelease(vertex_buffer);
        wgpuBufferRelease(index_buffer);
        wgpuBufferRelease(uniform_buffer);
        wgpuPipelineLayoutRelease(layout);
        wgpuBindGroupLayoutRelease(bind_group_layout);
        wgpuBindGroupRelease(bind_group);

        wgpuRenderPipelineRelease(pipeline);
        wgpuSurfaceUnconfigure(surface);
        wgpuSurfaceRelease(surface);
        wgpuQueueRelease(queue);
        wgpuDeviceRelease(device);
        glfwDestroyWindow(window);
        glfwTerminate();
    }

    void main_loop() {
        glfwPollEvents();
        float time = static_cast<float>(glfwGetTime());
        wgpuQueueWriteBuffer(queue, uniform_buffer, offsetof(MyUniforms, time), &time, sizeof(float));

        auto [surface_texture, target_view] = get_next_surface_view_data();
        if (!target_view) return;

        WGPUCommandEncoderDescriptor encoder_descriptor = {};
        encoder_descriptor.nextInChain = nullptr;
        encoder_descriptor.label = "my encoder";
        WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encoder_descriptor);

        WGPURenderPassColorAttachment render_pass_color_attachment = {};
        render_pass_color_attachment.view = target_view;
        render_pass_color_attachment.resolveTarget = nullptr;
        render_pass_color_attachment.loadOp = WGPULoadOp_Clear;
        render_pass_color_attachment.storeOp = WGPUStoreOp_Store;
        render_pass_color_attachment.clearValue = WGPUColor{0.9, 0.1, 0.2, 1.0};
    #ifndef WEBGPU_BACKEND_WGPU
        render_pass_color_attachment.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
    #endif

        WGPURenderPassDescriptor render_pass_descriptor = {};
        render_pass_descriptor.nextInChain = nullptr;
        render_pass_descriptor.colorAttachmentCount = 1;
        render_pass_descriptor.colorAttachments = &render_pass_color_attachment;
        render_pass_descriptor.depthStencilAttachment = nullptr;
        render_pass_descriptor.timestampWrites = nullptr;


        WGPURenderPassEncoder render_pass = wgpuCommandEncoderBeginRenderPass(encoder, &render_pass_descriptor);
        wgpuRenderPassEncoderSetPipeline(render_pass, pipeline);
        wgpuRenderPassEncoderSetVertexBuffer(render_pass, 0, vertex_buffer, 0, wgpuBufferGetSize(vertex_buffer));
        wgpuRenderPassEncoderSetIndexBuffer(render_pass, index_buffer, WGPUIndexFormat_Uint32, 0, wgpuBufferGetSize(index_buffer));
        wgpuRenderPassEncoderSetBindGroup(render_pass, 0, bind_group, 0, nullptr);
        wgpuRenderPassEncoderDrawIndexed(render_pass, index_count, 1, 0, 0, 0);
        wgpuRenderPassEncoderEnd(render_pass);
        wgpuRenderPassEncoderRelease(render_pass);

        WGPUCommandBufferDescriptor command_buffer_descriptor = {};
        command_buffer_descriptor.nextInChain = nullptr;
        command_buffer_descriptor.label = "my cmd buffer";
        WGPUCommandBuffer command = wgpuCommandEncoderFinish(encoder, &command_buffer_descriptor);
        wgpuCommandEncoderRelease(encoder);
        wgpuQueueSubmit(queue, 1, &command);
        wgpuCommandBufferRelease(command);

        wgpuTextureViewRelease(target_view); 

#ifndef __EMSCRIPTEN__
        wgpuSurfacePresent(surface);
#endif

#if defined(WEBGPU_BACKEND_DAWN)
        wgpuDeviceTick(device);
#elif defined(WEBGPU_BACKEND_WGPU)
        wgpuDevicePoll(device, false, nullptr);
#endif
    }

    bool is_running() {
        return !glfwWindowShouldClose(window);
    }

    void init_pipeline() {
        WGPUShaderModuleDescriptor shader_descriptor = {};
#ifdef WEBGPU_BACKEND_WGPU
        shader_descriptor.hintCount = 0;
        shader_descriptor.hints = nullptr;
#endif

        WGPUShaderModuleWGSLDescriptor shader_code_descriptor = {};
        shader_code_descriptor.chain.next = nullptr; 
        shader_code_descriptor.chain.sType = WGPUSType_ShaderModuleWGSLDescriptor;        
        shader_descriptor.nextInChain = &shader_code_descriptor.chain;
        shader_code_descriptor.code = shader_source;

        WGPUShaderModule shader_module = wgpuDeviceCreateShaderModule(device, &shader_descriptor);

        WGPURenderPipelineDescriptor pipeline_descriptor = {};
        pipeline_descriptor.nextInChain = nullptr;

        // Vertex pipeline state
        WGPUVertexBufferLayout vertex_buffer_layout = {};
        std::vector<WGPUVertexAttribute> vertex_attributes(2);
        vertex_attributes[0].shaderLocation = 0;
        vertex_attributes[0].format = WGPUVertexFormat_Float32x2;
        vertex_attributes[0].offset = 0;

        vertex_attributes[1].shaderLocation = 1;
        vertex_attributes[1].format = WGPUVertexFormat_Float32x3;
        vertex_attributes[1].offset = 2 * sizeof(float);

        vertex_buffer_layout.attributeCount = static_cast<uint32_t>(vertex_attributes.size());
        vertex_buffer_layout.attributes = vertex_attributes.data();
        vertex_buffer_layout.arrayStride = 5 * sizeof(float);
        vertex_buffer_layout.stepMode = WGPUVertexStepMode_Vertex;

        pipeline_descriptor.vertex.bufferCount = 1;
        pipeline_descriptor.vertex.buffers = &vertex_buffer_layout;
        pipeline_descriptor.vertex.module = shader_module;
        pipeline_descriptor.vertex.entryPoint = "vs_main";
        pipeline_descriptor.vertex.constantCount = 0;
        pipeline_descriptor.vertex.constants = nullptr;

        // Primitive pipeline state
        pipeline_descriptor.primitive.topology = WGPUPrimitiveTopology_TriangleList;
        pipeline_descriptor.primitive.stripIndexFormat = WGPUIndexFormat_Undefined;
        pipeline_descriptor.primitive.frontFace = WGPUFrontFace_CCW;
        pipeline_descriptor.primitive.cullMode = WGPUCullMode_None;

        // Fragment shader state
        WGPUFragmentState fragment_state = {};
        fragment_state.module = shader_module;
        fragment_state.entryPoint = "fs_main";
        fragment_state.constantCount = 0;
        fragment_state.constants = nullptr;

        // Blending state
        WGPUBlendState blend_state = {};
        blend_state.color.srcFactor = WGPUBlendFactor_SrcAlpha;
        blend_state.color.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
        blend_state.color.operation = WGPUBlendOperation_Add;
        blend_state.alpha.srcFactor = WGPUBlendFactor_Zero;
        blend_state.alpha.dstFactor = WGPUBlendFactor_One;
        blend_state.alpha.operation = WGPUBlendOperation_Add;
        
        WGPUColorTargetState color_target = {};
        color_target.format = surface_format;
        color_target.blend = &blend_state;
        color_target.writeMask = WGPUColorWriteMask_All;

        fragment_state.targetCount = 1;
        fragment_state.targets = &color_target;
        pipeline_descriptor.fragment = &fragment_state;

        // Depth/Stencil State
        pipeline_descriptor.depthStencil = nullptr;

        // Multi-sampling
        pipeline_descriptor.multisample.count = 1;
        pipeline_descriptor.multisample.mask = ~0u;
        pipeline_descriptor.multisample.alphaToCoverageEnabled = false;

        // Pipeline Layout (memory layout for buffers/textures)
        WGPUBindGroupLayoutEntry binding_layout = {};
        set_default(binding_layout);
        binding_layout.binding = 0;
        binding_layout.visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
        binding_layout.buffer.type = WGPUBufferBindingType_Uniform;
        binding_layout.buffer.minBindingSize = sizeof(MyUniforms);

        WGPUBindGroupLayoutDescriptor bind_group_layout_descriptor = {};
        bind_group_layout_descriptor.nextInChain = nullptr;
        bind_group_layout_descriptor.entryCount = 1;
        bind_group_layout_descriptor.entries = &binding_layout;
        bind_group_layout = wgpuDeviceCreateBindGroupLayout(device, &bind_group_layout_descriptor);

        WGPUPipelineLayoutDescriptor layout_descriptor = {};
        layout_descriptor.nextInChain = nullptr;
        layout_descriptor.bindGroupLayoutCount = 1;
        layout_descriptor.bindGroupLayouts = &bind_group_layout;
        layout = wgpuDeviceCreatePipelineLayout(device, &layout_descriptor);

        pipeline_descriptor.layout = layout;

        pipeline = wgpuDeviceCreateRenderPipeline(device, &pipeline_descriptor);
        wgpuShaderModuleRelease(shader_module);
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

        WGPUBufferDescriptor buffer_descriptor = {};
        buffer_descriptor.nextInChain = nullptr;
        buffer_descriptor.size = vertex_data.size() * sizeof(float);
        buffer_descriptor.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_Vertex;
        buffer_descriptor.mappedAtCreation = false;
        vertex_buffer = wgpuDeviceCreateBuffer(device, &buffer_descriptor);
        wgpuQueueWriteBuffer(queue, vertex_buffer, 0, vertex_data.data(), buffer_descriptor.size);

        buffer_descriptor.size = index_data.size() * sizeof(uint32_t);
        buffer_descriptor.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_Index;
        index_buffer = wgpuDeviceCreateBuffer(device, &buffer_descriptor);

        wgpuQueueWriteBuffer(queue, index_buffer, 0, index_data.data(), buffer_descriptor.size);

        buffer_descriptor.size = sizeof(MyUniforms);
        buffer_descriptor.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_Uniform;
        uniform_buffer = wgpuDeviceCreateBuffer(device, &buffer_descriptor);

        MyUniforms uniforms;
        uniforms.time = 1.0f;
        uniforms.color = {0.0f, 1.0f, 0.0f, 1.0f};
        wgpuQueueWriteBuffer(queue, uniform_buffer, 0, &uniforms, sizeof(MyUniforms));
    }

    void init_bind_groups() {
        WGPUBindGroupEntry binding = {};
        binding.nextInChain = nullptr;
        binding.binding = 0;
        binding.buffer = uniform_buffer;
        binding.offset = 0;
        binding.size = sizeof(MyUniforms);

        WGPUBindGroupDescriptor bind_group_descriptor = {};
        bind_group_descriptor.nextInChain = nullptr;
        bind_group_descriptor.layout = bind_group_layout;
        bind_group_descriptor.entryCount = 1;
        bind_group_descriptor.entries = &binding;
        bind_group = wgpuDeviceCreateBindGroup(device, &bind_group_descriptor);
    }
private:
    GLFWwindow* window;
    WGPUDevice device;
    WGPUQueue queue;
    WGPUSurface surface;
    WGPUTextureFormat surface_format = WGPUTextureFormat_Undefined;
    WGPURenderPipeline pipeline;

    WGPUBuffer vertex_buffer;
    WGPUBuffer index_buffer;
    uint32_t index_count;

    WGPUBuffer uniform_buffer;

    WGPUPipelineLayout layout;
    WGPUBindGroupLayout bind_group_layout;
    WGPUBindGroup bind_group;

    struct MyUniforms {
        std::array<float, 4> color;   
        float time;
        float _padding[3];
    };

    static_assert(sizeof(MyUniforms) % 16 == 0);

    void set_default_limits(WGPULimits& limits) const {
        limits.maxTextureDimension1D = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxTextureDimension2D = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxTextureDimension3D = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxTextureArrayLayers = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxBindGroups = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxBindGroupsPlusVertexBuffers = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxBindingsPerBindGroup = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxDynamicUniformBuffersPerPipelineLayout = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxDynamicStorageBuffersPerPipelineLayout = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxSampledTexturesPerShaderStage = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxSamplersPerShaderStage = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxStorageBuffersPerShaderStage = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxStorageTexturesPerShaderStage = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxUniformBuffersPerShaderStage = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxUniformBufferBindingSize = WGPU_LIMIT_U64_UNDEFINED;
        limits.maxStorageBufferBindingSize = WGPU_LIMIT_U64_UNDEFINED;
        limits.minUniformBufferOffsetAlignment = WGPU_LIMIT_U32_UNDEFINED;
        limits.minStorageBufferOffsetAlignment = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxVertexBuffers = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxBufferSize = WGPU_LIMIT_U64_UNDEFINED;
        limits.maxVertexAttributes = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxVertexBufferArrayStride = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxInterStageShaderComponents = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxInterStageShaderVariables = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxColorAttachments = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxColorAttachmentBytesPerSample = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxComputeWorkgroupStorageSize = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxComputeInvocationsPerWorkgroup = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxComputeWorkgroupSizeX = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxComputeWorkgroupSizeY = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxComputeWorkgroupSizeZ = WGPU_LIMIT_U32_UNDEFINED;
        limits.maxComputeWorkgroupsPerDimension = WGPU_LIMIT_U32_UNDEFINED;
    }

    void set_default(WGPUBindGroupLayoutEntry &bindingLayout) {
        bindingLayout.buffer.nextInChain = nullptr;
        bindingLayout.buffer.type = WGPUBufferBindingType_Undefined;
        bindingLayout.buffer.hasDynamicOffset = false;

        bindingLayout.sampler.nextInChain = nullptr;
        bindingLayout.sampler.type = WGPUSamplerBindingType_Undefined;

        bindingLayout.storageTexture.nextInChain = nullptr;
        bindingLayout.storageTexture.access = WGPUStorageTextureAccess_Undefined;
        bindingLayout.storageTexture.format = WGPUTextureFormat_Undefined;
        bindingLayout.storageTexture.viewDimension = WGPUTextureViewDimension_Undefined;

        bindingLayout.texture.nextInChain = nullptr;
        bindingLayout.texture.multisampled = false;
        bindingLayout.texture.sampleType = WGPUTextureSampleType_Undefined;
        bindingLayout.texture.viewDimension = WGPUTextureViewDimension_Undefined;
    }


    WGPURequiredLimits get_required_limits(WGPUAdapter adapter) const {
        WGPUSupportedLimits supported_limits;
        supported_limits.nextInChain = nullptr;
        wgpuAdapterGetLimits(adapter, &supported_limits);

        WGPURequiredLimits required_limits = {};
        set_default_limits(required_limits.limits);

        required_limits.limits.maxVertexAttributes = 2;
        required_limits.limits.maxVertexBuffers = 1;
        required_limits.limits.maxBufferSize = 6 * 5 * sizeof(float);
        required_limits.limits.maxVertexBufferArrayStride = 5 * sizeof(float);
        required_limits.limits.maxInterStageShaderComponents = 3;

        required_limits.limits.maxBindGroups = 1;
        required_limits.limits.maxUniformBuffersPerShaderStage = 1;
        required_limits.limits.maxUniformBufferBindingSize = 16 * 4;

        required_limits.limits.minUniformBufferOffsetAlignment = supported_limits.limits.minUniformBufferOffsetAlignment;
        required_limits.limits.minStorageBufferOffsetAlignment = supported_limits.limits.minStorageBufferOffsetAlignment;

        return required_limits;
    }

    std::pair<WGPUSurfaceTexture, WGPUTextureView> get_next_surface_view_data() {
        WGPUSurfaceTexture surface_texture;
        wgpuSurfaceGetCurrentTexture(surface, &surface_texture);        

        if (surface_texture.status != WGPUSurfaceGetCurrentTextureStatus_Success) {
            return {surface_texture, nullptr};
        }

       WGPUTextureViewDescriptor view_descriptor;
       view_descriptor.nextInChain = nullptr;
       view_descriptor.label = "Surface texture view";
       view_descriptor.format = wgpuTextureGetFormat(surface_texture.texture);
       view_descriptor.dimension = WGPUTextureViewDimension_2D;
       view_descriptor.baseMipLevel = 0;
       view_descriptor.mipLevelCount = 1;
       view_descriptor.baseArrayLayer = 0;
       view_descriptor.arrayLayerCount = 1;
       view_descriptor.aspect = WGPUTextureAspect_All;
       WGPUTextureView target_view = wgpuTextureCreateView(surface_texture.texture, &view_descriptor);

#ifndef WEBGPU_BACKEND_WGPU
        wgpuTextureRelease(surface_texture.texture);
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