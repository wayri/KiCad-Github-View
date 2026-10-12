import Foundation
import Network
import Security

/// A single-purpose HTTP host. It never listens on Wi-Fi or serves user files.
final class LocalViewerServer {
    private let queue = DispatchQueue(label: "PocketKiView.loopback")
    private let port: UInt16 = 49273
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]
    private var assetRoot: URL?
    private var assets = Set<String>()
    private var session = ""
    private var snapshotProvider: (() -> Data?)?
    private(set) var origin = URL(string: "http://127.0.0.1:49273")!

    private struct ServerError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    func start(assetRoot: URL, snapshotProvider: @escaping () -> Data?,
               completion: @escaping (Result<URL, Error>) -> Void) {
        queue.async {
            self.stopOnQueue()
            do {
                let root = assetRoot.standardizedFileURL
                guard root.isFileURL,
                      try root.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else {
                    throw ServerError(message: "The bundled web directory is invalid.")
                }
                let manifest = try self.readAsset(root: root, name: "ios-assets.json", limit: 1_048_576)
                guard let object = try JSONSerialization.jsonObject(with: manifest) as? [String: Any],
                      let names = object["files"] as? [String], names.count <= 3000,
                      names.contains("local-viewer.html") else {
                    throw ServerError(message: "The iOS web asset inventory is missing or invalid.")
                }
                for name in names where !self.safeAsset(name) {
                    throw ServerError(message: "Unsafe bundled asset: \(name)")
                }
                var random = [UInt8](repeating: 0, count: 32)
                guard SecRandomCopyBytes(kSecRandomDefault, random.count, &random) == errSecSuccess else {
                    throw ServerError(message: "A secure local session could not be created.")
                }
                self.session = Data(random).base64EncodedString()
                    .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                    .replacingOccurrences(of: "=", with: "")
                self.assetRoot = root
                self.assets = Set(names)
                self.snapshotProvider = snapshotProvider
                let parameters = NWParameters.tcp
                parameters.requiredInterfaceType = .loopback
                parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: self.port)!)
                parameters.allowLocalEndpointReuse = false
                let listener = try NWListener(using: parameters)
                self.listener = listener
                var reported = false
                listener.stateUpdateHandler = { [weak self, weak listener] state in
                    guard let self = self, self.listener === listener, !reported else { return }
                    switch state {
                    case .ready:
                        reported = true
                        let url = URL(string: self.origin.absoluteString + "/local-viewer.html?native=ios&session=" + self.session)!
                        DispatchQueue.main.async { completion(.success(url)) }
                    case .failed(let error):
                        reported = true
                        self.stopOnQueue()
                        DispatchQueue.main.async { completion(.failure(error)) }
                    case .cancelled:
                        reported = true
                        DispatchQueue.main.async { completion(.failure(ServerError(message: "The local viewer stopped."))) }
                    default: break
                    }
                }
                listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
                listener.start(queue: self.queue)
            } catch {
                self.stopOnQueue()
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    func stop() { queue.async { self.stopOnQueue() } }

    private func stopOnQueue() {
        listener?.cancel()
        listener = nil
        for connection in connections.values { connection.cancel() }
        connections.removeAll()
        snapshotProvider = nil
        session = ""
    }

    private func accept(_ connection: NWConnection) {
        guard connections.count < 8 else { connection.cancel(); return }
        let id = UUID()
        connections[id] = connection
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 15) { [weak self, weak connection] in
            guard self?.connections[id] != nil else { return }
            connection?.cancel()
            self?.connections.removeValue(forKey: id)
        }
        receive(connection, id: id, buffer: Data())
    }

    private func receive(_ connection: NWConnection, id: UUID, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: max(1, 8193 - buffer.count)) { [weak self] data, _, complete, error in
            guard let self = self, self.connections[id] != nil else { return }
            var input = buffer
            if let data = data { input.append(data) }
            if input.count > 8192 { self.respond(connection, id: id, status: 431, body: Data()); return }
            if let end = input.range(of: Data([13, 10, 13, 10])) {
                guard end.upperBound == input.count, let text = String(data: input, encoding: .utf8) else {
                    self.respond(connection, id: id, status: 400, body: Data()); return
                }
                self.handle(text, connection: connection, id: id)
            } else if complete || error != nil {
                connection.cancel()
                self.connections.removeValue(forKey: id)
            } else { self.receive(connection, id: id, buffer: input) }
        }
    }

    private func handle(_ text: String, connection: NWConnection, id: UUID) {
        let lines = text.components(separatedBy: "\r\n")
        let request = lines[0].split(separator: " ", omittingEmptySubsequences: false)
        guard request.count == 3, request[2] == "HTTP/1.1" else {
            respond(connection, id: id, status: 400, body: Data()); return
        }
        guard request[0] == "GET" else { respond(connection, id: id, status: 405, body: Data()); return }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() where !line.isEmpty {
            guard let colon = line.firstIndex(of: ":"), !line.hasPrefix(" "), !line.hasPrefix("\t") else {
                respond(connection, id: id, status: 400, body: Data()); return
            }
            let key = String(line[..<colon]).lowercased()
            let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            guard !key.isEmpty, headers[key] == nil else { respond(connection, id: id, status: 400, body: Data()); return }
            headers[key] = value
        }
        guard headers["host"] == "127.0.0.1:\(port)",
              headers["origin"] == nil || headers["origin"] == origin.absoluteString else {
            respond(connection, id: id, status: 403, body: Data()); return
        }
        guard headers["transfer-encoding"] == nil,
              headers["content-length"] == nil || headers["content-length"] == "0" else {
            respond(connection, id: id, status: 400, body: Data()); return
        }
        let target = String(request[1])
        guard target.hasPrefix("/"), !target.hasPrefix("//"),
              let parts = URLComponents(string: origin.absoluteString + target) else {
            respond(connection, id: id, status: 400, body: Data()); return
        }
        if parts.path == "/api/project" {
            guard constantEqual(headers["x-kiview-session"] ?? "", session) else {
                respond(connection, id: id, status: 403, body: Data()); return
            }
            guard let data = snapshotProvider?() else {
                respond(connection, id: id, status: 404, body: Data("{\"error\":\"Open saved files or a project folder first.\"}".utf8), mime: "application/json"); return
            }
            guard data.count <= 140 * 1024 * 1024 else { respond(connection, id: id, status: 413, body: Data()); return }
            respond(connection, id: id, status: 200, body: data, mime: "application/json; charset=utf-8")
            return
        }
        let name = parts.path == "/" ? "local-viewer.html" : String(parts.path.dropFirst())
        guard assets.contains(name), safeAsset(name), let root = assetRoot else {
            respond(connection, id: id, status: 404, body: Data()); return
        }
        do { respond(connection, id: id, status: 200, body: try readAsset(root: root, name: name, limit: 64 * 1024 * 1024), mime: mime(name)) }
        catch { respond(connection, id: id, status: 404, body: Data()) }
    }

    private func constantEqual(_ lhs: String, _ rhs: String) -> Bool {
        let a = Array(lhs.utf8), b = Array(rhs.utf8)
        guard !b.isEmpty, a.count == b.count else { return false }
        var difference: UInt8 = 0
        for index in a.indices { difference |= a[index] ^ b[index] }
        return difference == 0
    }

    private func safeAsset(_ name: String) -> Bool {
        guard !name.isEmpty, name.count <= 1024, !name.contains("\\"), !name.contains(":"),
              !name.unicodeScalars.contains(where: { $0.value < 32 }),
              name.split(separator: "/", omittingEmptySubsequences: false).allSatisfy({ !$0.isEmpty && !$0.hasPrefix(".") }) else { return false }
        let file = (name as NSString).lastPathComponent
        let forbidden = ["manifest.json", "ios-assets.json", "background.js", "content.js", "options.html", "options.js", "github-review-api.js", "gitlab-review-api.js", "gitlab-options.js", "gitlab-hosts.js", "gitlab-provider.js", "mention-users.js"]
        if forbidden.contains(file) || file.hasPrefix("credential-vault") { return false }
        let ext = (name as NSString).pathExtension.lowercased()
        if ["json", "txt"].contains(ext) { return name.hasPrefix("vendor/") }
        if ["html", "css", "js", "mjs", "wasm", "png", "jpg", "jpeg", "svg", "ico", "md", "bcmap", "pfb", "ttf"].contains(ext) { return true }
        return name.hasPrefix("vendor/") && file.contains("LICENSE")
    }

    private func readAsset(root: URL, name: String, limit: Int) throws -> Data {
        guard !name.hasPrefix("/"), !name.contains("\\"), !name.contains(":"),
              name.split(separator: "/", omittingEmptySubsequences: false).allSatisfy({ !$0.isEmpty && !$0.hasPrefix(".") }) else {
            throw ServerError(message: "Unsafe web path.")
        }
        var file = root
        for component in name.split(separator: "/") {
            file.appendPathComponent(String(component))
            guard try file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw ServerError(message: "Linked web paths are unavailable.") }
        }
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, (values.fileSize ?? limit + 1) <= limit,
              file.resolvingSymlinksInPath().path.hasPrefix(root.resolvingSymlinksInPath().path + "/") else {
            throw ServerError(message: "Invalid or oversized bundled web asset.")
        }
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var data = Data()
        while let chunk = try handle.read(upToCount: min(1_048_576, limit + 1 - data.count)), !chunk.isEmpty {
            data.append(chunk)
            guard data.count <= limit else { throw ServerError(message: "Oversized bundled web asset.") }
        }
        return data
    }

    private func mime(_ name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "wasm": return "application/wasm"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "ttf": return "font/ttf"
        default: return "application/octet-stream"
        }
    }

    private func respond(_ connection: NWConnection, id: UUID, status: Int, body: Data, mime: String = "text/plain") {
        let reason = [200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 413: "Content Too Large", 431: "Request Header Fields Too Large"][status] ?? "Error"
        var data = Data("HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCross-Origin-Resource-Policy: same-origin\r\nX-Frame-Options: SAMEORIGIN\r\n\r\n".utf8)
        data.append(body)
        connection.send(content: data, completion: .contentProcessed { [weak self, weak connection] _ in
            connection?.cancel()
            self?.connections.removeValue(forKey: id)
        })
    }
}
