#define WEBGPU_CPP_IMPLEMENTATION
#include <webgpu/webgpu.hpp>

#include <iostream>

int main() {
    WGPUInstanceDescriptor desc = {};
    desc.nextInChain = nullptr;

#ifdef WEBGPU_BACKEND_EMSCRIPTEN
    WGPUInstance instance = wgpuCreateInstance(nullptr);
#else
    WGPUInstance instance = wgpuCreateInstance(&desc);
#endif

    if (!instance) {
        std::cout << "Failed to initialize WebGPU\n";
        return -1;
    }

    std::cout << "WebGPU Instance: " << instance << "\n";

    wgpuInstanceRelease(instance);
}