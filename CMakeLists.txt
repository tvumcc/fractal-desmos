cmake_minimum_required(VERSION 3.23)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

project(equation_to_julia LANGUAGES C CXX)

add_subdirectory(lib/webgpu)
include_directories(
	${CMAKE_CURRENT_SOURCE_DIR}/include 
    ${CMAKE_CURRENT_SOURCE_DIR}/build/_deps/webgpu-backend-wgpu-src/include/webgpu
)

file(GLOB_RECURSE SRC_FILES src/*.cpp)

add_executable(${CMAKE_PROJECT_NAME}
	${SRC_FILES}
)

target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE webgpu)
target_copy_webgpu_binaries(${CMAKE_PROJECT_NAME})

if (EMSCRIPTEN)
	set_target_properties(App PROPERTIES SUFFIX ".html")	
endif()