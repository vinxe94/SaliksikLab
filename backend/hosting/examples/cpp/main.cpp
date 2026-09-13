// Small Linux HTTP demo for temporary hosting; no external C++ libraries.
#include <arpa/inet.h>
#include <cerrno>
#include <csignal>
#include <cstdlib>
#include <iostream>
#include <string>
#include <sys/socket.h>
#include <unistd.h>

int main() {
    std::signal(SIGPIPE, SIG_IGN);
    const char* value = std::getenv("PORT");
    const int port = value ? std::atoi(value) : 8080;
    if (port < 1 || port > 65535) return 1;
    const int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) return 1;
    const int reuse = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_ANY);
    address.sin_port = htons(static_cast<unsigned short>(port));
    if (bind(server, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0 || listen(server, 16) != 0) {
        std::cerr << "Unable to listen on PORT=" << port << '\n';
        close(server);
        return 1;
    }
    std::cout << "C++ HTTP server listening on 0.0.0.0:" << port << std::endl;
    const std::string body = "<!doctype html><html><head><title>C++ preview</title></head><body><h1>C++ hosting works!</h1></body></html>";
    const std::string response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "
        + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
    while (true) {
        const int client = accept(server, nullptr, nullptr);
        if (client < 0) {
            if (errno == EINTR) continue;
            close(server);
            return 1;
        }
        const timeval timeout{3, 0};
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        char request[8192];
        if (recv(client, request, sizeof(request), 0) > 0) {
            std::size_t sent = 0;
            while (sent < response.size()) {
                const auto count = send(client, response.data() + sent, response.size() - sent, 0);
                if (count <= 0) break;
                sent += static_cast<std::size_t>(count);
            }
        }
        close(client);
    }
}
