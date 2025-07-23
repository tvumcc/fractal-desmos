cmake_minimum_required(VERSION 3.23)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

project(fractal_desmos LANGUAGES C CXX)

add_subdirectory(lib/webgpu)
if (NOT EMSCRIPTEN)
	add_subdirectory(lib/glfw)
# else()
# 	add_library(glfw INTERFACE)
# 	target_link_options(glfw INTERFACE -sUSE_GLFW=3)
endif()
add_subdirectory(lib/glfw3webgpu)
include_directories(
	${CMAKE_CURRENT_SOURCE_DIR}/include
	${CMAKE_CURRENT_SOURCE_DIR}/lib/glfw/include 
    ${CMAKE_CURRENT_SOURCE_DIR}/build/_deps/webgpu-backend-wgpu-src/include/webgpu
	${CMAKE_CURRENT_SOURCE_DIR}/lib/glfw3webgpu
)

# file(GLOB_RECURSE SRC_FILES src/*.cpp)

add_executable(${CMAKE_PROJECT_NAME}
	# ${SRC_FILES}
	src/Main.cpp
)

target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE webgpu glfw glfw3webgpu)
target_copy_webgpu_binaries(${CMAKE_PROJECT_NAME})

if (EMSCRIPTEN)
	set_target_properties(${CMAKE_PROJECT_NAME} PROPERTIES SUFFIX ".html")	
	target_link_options(${CMAKE_PROJECT_NAME} PRIVATE 
		-sUSE_GLFW=3
		-sUSE_WEBGPU
		-sASYNCIFY
		-sALLOW_MEMORY_GROWTH
	)
endif()