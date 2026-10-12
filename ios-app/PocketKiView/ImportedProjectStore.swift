import Foundation
import CryptoKit

/// Copies only explicitly selected, saved bytes into an app-private snapshot.
/// Source CAD files, bookmarks and security-scope credentials are never written.
final class ImportedProjectStore {
    private let directory: URL
    private let lock = NSLock()
    private let fileLimit = 32 * 1024 * 1024
    private let projectLimit = 96 * 1024 * 1024
    private let fileCountLimit = 512
    private let textExtensions: Set<String> = ["kicad_sch", "kicad_pcb", "kicad_pro", "kicad_prl", "kicad_dru", "kicad_wks", "json", "csv", "tsv", "txt", "wbk", "raw", "html", "htm", "gbr", "ger", "gerber", "gtl", "gbl", "gts", "gbs", "gto", "gbo", "gtp", "gbp", "gko", "drl", "xln"]
    private let modelExtensions: Set<String> = ["step", "stp", "wrl", "vrml", "glb", "pdf"]
    private let skipDirectories: Set<String> = ["build", "dist", "node_modules", "__pycache__"]

    private struct ImportError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    init(directory: URL) { self.directory = directory.standardizedFileURL }

    func load() throws -> Data? {
        lock.lock()
        defer { lock.unlock() }
        try ensurePrivateDirectory()
        let file = directory.appendingPathComponent("lastImported.json")
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let values = try file.resourceValues(forKeys: [.isSymbolicLinkKey, .fileSizeKey, .isRegularFileKey])
        guard values.isSymbolicLink != true, values.isRegularFile == true,
              (values.fileSize ?? 140 * 1024 * 1024 + 1) <= 140 * 1024 * 1024 else {
            throw ImportError(message: "The saved import snapshot is invalid or oversized.")
        }
        return try Data(contentsOf: file)
    }

    func importURLs(_ urls: [URL], folder: Bool) throws -> Data {
        lock.lock()
        defer { lock.unlock() }
        guard !urls.isEmpty, urls.count <= fileCountLimit, urls.allSatisfy({ $0.isFileURL }),
              !folder || urls.count == 1 else {
            throw ImportError(message: "Choose saved files or one project folder.")
        }
        let selections = urls.map { $0.standardizedFileURL }
        // A false return is valid for a URL already available inside the sandbox.
        // Coordinated reads remain authoritative for externally granted URLs.
        let scoped = selections.filter { $0.startAccessingSecurityScopedResource() }
        defer { scoped.forEach { $0.stopAccessingSecurityScopedResource() } }
        var candidates: [URL] = []
        let root: URL
        var warnings: [String] = []
        if folder {
            root = selections[0]
            let values = try root.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard values.isDirectory == true, values.isSymbolicLink != true else {
                throw ImportError(message: "Choose a real project folder, not a linked directory.")
            }
            try coordinated(root) { [self] grantedRoot in
                guard grantedRoot.standardizedFileURL.path == root.path else {
                    throw ImportError(message: "The selected folder moved during import. Choose it again.")
                }
                var walkError: Error?
                guard let enumerator = FileManager.default.enumerator(at: root,
                    includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .isRegularFileKey],
                    options: [.skipsHiddenFiles], errorHandler: { _, error in walkError = error; return false }) else {
                    throw ImportError(message: "The selected folder could not be read.")
                }
                while let file = enumerator.nextObject() as? URL {
                    let metadata = try file.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .isRegularFileKey])
                    if metadata.isSymbolicLink == true {
                        enumerator.skipDescendants()
                        warnings.append("Skipped a linked project path.")
                        continue
                    }
                    if metadata.isDirectory == true {
                        if skipDirectories.contains(file.lastPathComponent) { enumerator.skipDescendants() }
                        continue
                    }
                    if metadata.isRegularFile == true && supported(file) {
                        candidates.append(file)
                        if candidates.count > fileCountLimit { throw ImportError(message: "Project exceeds 512 supported files.") }
                    }
                }
                if let error = walkError { throw error }
            }
        } else {
            root = commonParent(selections)
            for file in selections {
                let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
                guard values.isRegularFile == true, values.isSymbolicLink != true else {
                    throw ImportError(message: "Choose saved files; linked paths and folders are not imported as files.")
                }
                if supported(file) { candidates.append(file) }
                else { warnings.append("Skipped unsupported file: \(file.lastPathComponent)") }
            }
        }
        guard !candidates.isEmpty else { throw ImportError(message: "No supported KiCad drawings or review files were selected.") }
        var total = 0
        var seen = Set<String>()
        var files: [[String: String]] = []
        var assets: [[String: String]] = []
        for file in candidates.sorted(by: { $0.path < $1.path }) {
            let relative = try relativePath(file, root: root)
            guard seen.insert(relative).inserted else { throw ImportError(message: "Duplicate imported path: \(relative)") }
            var content: Data?
            try coordinated(file) { [self] grantedFile in
                guard grantedFile.standardizedFileURL.path == file.standardizedFileURL.path else {
                    throw ImportError(message: "A selected file moved during import. Choose it again.")
                }
                _ = try relativePath(grantedFile, root: root)
                let size = try grantedFile.resourceValues(forKeys: [.fileSizeKey]).fileSize
                if let size = size, size > fileLimit { throw ImportError(message: "\(relative) exceeds 32 MiB.") }
                let handle = try FileHandle(forReadingFrom: grantedFile)
                defer { try? handle.close() }
                var data = Data()
                while let chunk = try handle.read(upToCount: min(1_048_576, fileLimit + 1 - data.count)), !chunk.isEmpty {
                    data.append(chunk)
                    guard data.count <= fileLimit else { throw ImportError(message: "\(relative) exceeds 32 MiB.") }
                }
                content = data
            }
            guard let data = content else { throw ImportError(message: "A selected file was unavailable.") }
            total += data.count
            guard total <= projectLimit else { throw ImportError(message: "Project exceeds the 96 MiB import limit.") }
            if modelExtensions.contains(file.pathExtension.lowercased()) {
                assets.append(["path": relative, "base64": data.base64EncodedString()])
            } else {
                guard var text = String(data: data, encoding: .utf8) else {
                    throw ImportError(message: "\(relative) is not UTF-8 text. The previous project was retained.")
                }
                if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
                files.append(["path": relative, "content": text])
            }
        }
        let canonical = try JSONSerialization.data(withJSONObject: ["files": files, "assets": assets], options: [.sortedKeys])
        let digest = SHA256.hash(data: canonical).map { String(format: "%02x", $0) }.joined()
        var result: [String: Any] = ["id": "ios-" + String(digest.prefix(24)), "name": root.lastPathComponent,
                                    "files": files, "assets": assets, "warnings": warnings]
        if !folder, selections.count == 1, let selected = candidates.first {
            result["rootFile"] = try relativePath(selected, root: root)
        }
        let snapshot = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        try save(snapshot)
        return snapshot
    }

    private func supported(_ url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        return textExtensions.contains(ext) || modelExtensions.contains(ext) ||
            ["fp-lib-table", "sym-lib-table"].contains(url.lastPathComponent) ||
            (ext.range(of: "^g(m)?[0-9]+$", options: .regularExpression) != nil)
    }

    private func commonParent(_ urls: [URL]) -> URL {
        var parts = urls[0].deletingLastPathComponent().pathComponents
        for url in urls.dropFirst() {
            let other = url.deletingLastPathComponent().pathComponents
            while !parts.isEmpty && (parts.count > other.count || Array(other.prefix(parts.count)) != parts) { parts.removeLast() }
        }
        return URL(fileURLWithPath: NSString.path(withComponents: parts), isDirectory: true)
    }

    private func relativePath(_ url: URL, root: URL) throws -> String {
        let prefix = root.standardizedFileURL.path.hasSuffix("/") ? root.standardizedFileURL.path : root.standardizedFileURL.path + "/"
        let file = url.standardizedFileURL
        guard file.path.hasPrefix(prefix) else { throw ImportError(message: "A selected path is outside its project root.") }
        let relative = String(file.path.dropFirst(prefix.count))
        guard !relative.isEmpty, relative.count <= 500, !relative.contains("\\"), !relative.contains(":"),
              !relative.unicodeScalars.contains(where: { $0.value < 32 }),
              relative.split(separator: "/", omittingEmptySubsequences: false).allSatisfy({ !$0.isEmpty && !$0.hasPrefix(".") }) else {
            throw ImportError(message: "Unsafe or hidden project path.")
        }
        var current = root
        for component in relative.split(separator: "/") {
            current.appendPathComponent(String(component))
            guard try current.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else {
                throw ImportError(message: "Linked project paths are not imported.")
            }
        }
        let resolvedRoot = root.resolvingSymlinksInPath().path
        let resolvedPrefix = resolvedRoot.hasSuffix("/") ? resolvedRoot : resolvedRoot + "/"
        guard file.resolvingSymlinksInPath().path.hasPrefix(resolvedPrefix) else { throw ImportError(message: "A selected path escaped its project root.") }
        return relative
    }

    private func coordinated(_ url: URL, read: @escaping (URL) throws -> Void) throws {
        var coordinationError: NSError?
        var accessError: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: .withoutChanges, error: &coordinationError) { grantedURL in
            do { try read(grantedURL) } catch { accessError = error }
        }
        if let error = coordinationError { throw error }
        if let error = accessError { throw error }
    }

    private func ensurePrivateDirectory() throws {
        let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path
        guard directory.isFileURL, directory.resolvingSymlinksInPath().path.hasPrefix(home + "/") else {
            throw ImportError(message: "Snapshots must be stored inside this app's private directory.")
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                               attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        guard try directory.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else {
            throw ImportError(message: "A snapshot directory cannot be a linked path.")
        }
        var protectedDirectory = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try protectedDirectory.setResourceValues(values)
    }

    private func save(_ data: Data) throws {
        try ensurePrivateDirectory()
        let destination = directory.appendingPathComponent("lastImported.json")
        var temporary = directory.appendingPathComponent(UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: temporary) }
        try data.write(to: temporary, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try temporary.setResourceValues(values)
        if FileManager.default.fileExists(atPath: destination.path) {
            guard try destination.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw ImportError(message: "The snapshot destination is invalid.") }
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporary, backupItemName: nil, options: [.usingNewMetadataOnly])
        } else { try FileManager.default.moveItem(at: temporary, to: destination) }
    }
}
