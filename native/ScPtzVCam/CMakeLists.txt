cmake_minimum_required(VERSION 3.20)
project(ScPtzVCam LANGUAGES CXX)

# Media source da câmera virtual "SC PTZ Virtual Cam".
# DLL COM in-proc carregada pelo Frame Server do Windows (via MFCreateVirtualCamera).
# x64 apenas — o Frame Server (64-bit) hospeda a source e faz a ponte para consumidores
# de qualquer bitness, então não é preciso build 32-bit (ao contrário do DirectShow).

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(ScPtzVCam SHARED
    dllmain.cpp
    MediaSource.cpp
    MediaStream.cpp
    FrameReader.cpp
    ScPtzVCam.def
)

# CRT estático (/MT): a DLL é carregada em processos arbitrários (Frame Server, apps
# consumidores) que podem não ter o VC++ redist.
set_property(TARGET ScPtzVCam PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

target_compile_definitions(ScPtzVCam PRIVATE
    UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)

target_link_libraries(ScPtzVCam PRIVATE
    mfsensorgroup   # MFCreateVirtualCamera / IMFVirtualCamera
    mfplat
    mf
    mfuuid
    mfreadwrite
    shlwapi
    shell32
    ole32
    oleaut32
    ksuser
    uuid
    advapi32
)

set_target_properties(ScPtzVCam PROPERTIES
    OUTPUT_NAME "ScPtzVCam"
    PREFIX ""
)
