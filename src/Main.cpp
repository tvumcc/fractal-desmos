#define WEBGPU_BACKEND_WGPU
#define WEBGPU_CPP_IMPLEMENTATION
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

        WGPUDeviceDescriptor device_descriptor = {};
        device_descriptor.deviceLostCallback = [](WGPUDeviceLostReason reason, char const *message, void * /* pUserData */) {
            std::cout << "Device lost: reason " << reason;
            if (message)
                std::cout << " (" << message << ")";
            std::cout << std::endl;
        };

        device = request_device_sync(adapter, &device_descriptor);

        WGPUTextureFormat surface_format = wgpuSurfaceGetPreferredFormat(surface, adapter);
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

        WGPUCommandEncoderDescriptor encoder_descriptor = {};
        encoder_descriptor.nextInChain = nullptr;
        WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encoder_descriptor);
        
        wgpuCommandEncoderInsertDebugMarker(encoder, "Do this");
        wgpuCommandEncoderInsertDebugMarker(encoder, "Do that");

        WGPUCommandBufferDescriptor command_buffer_descriptor = {};
        command_buffer_descriptor.nextInChain = nullptr;
        WGPUCommandBuffer command = wgpuCommandEncoderFinish(encoder, &command_buffer_descriptor);
        wgpuCommandEncoderRelease(encoder);

        wgpuQueueSubmit(queue, 1, &command);
        wgpuCommandBufferRelease(command);

        return true;
    } 

    void terminate() {
        wgpuSurfaceUnconfigure(surface);
        wgpuSurfaceRelease(surface);
        wgpuQueueRelease(queue);
        wgpuDeviceRelease(device);
        glfwDestroyWindow(window);
        glfwTerminate();
    }

    void main_loop() {
        glfwPollEvents();
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
        render_pass_color_attachment.clearValue = WGPUColor{0.9, 0.1, 0.1, 1.0};
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
private:
    GLFWwindow* window;
    WGPUDevice device;
    WGPUQueue queue;
    WGPUSurface surface;

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