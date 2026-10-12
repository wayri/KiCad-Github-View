import UIKit
import WebKit
import UniformTypeIdentifiers

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: ViewerViewController?

    init(_ target: ViewerViewController) {
        self.target = target
        super.init()
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

final class ViewerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate,
                                  WKScriptMessageHandler, UIDocumentPickerDelegate {
    private var webView: WKWebView!
    private let server = LocalViewerServer()
    private var launchURL: URL?
    private var store: ImportedProjectStore!
    private var snapshot: Data?
    private let snapshotLock = NSLock()
    private var folderImport = false
    private var importing = false
    private var storage: [String: String] = [:]
    private var storageURL: URL!
    private let trustedPages: Set<String> = ["local-viewer.html", "pcb-viewer.html", "schematic-viewer.html",
        "revision-viewer.html", "project-viewer.html", "analysis-viewer.html", "pdf-viewer.html",
        "gerber-viewer.html", "bom-viewer.html", "calculator-viewer.html"]

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 20 / 255, green: 28 / 255, blue: 37 / 255, alpha: 1)
        do {
            let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                      appropriateFor: nil, create: true)
                .appendingPathComponent("PocketKiView", isDirectory: true)
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var protectedDirectory = support
            try protectedDirectory.setResourceValues(values)
            store = ImportedProjectStore(directory: support)
            snapshot = try store.load()
            storageURL = support.appendingPathComponent("review-storage.json")
            if let data = try? Data(contentsOf: storageURL), data.count <= 16 * 1024 * 1024 {
                storage = (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
            }
            setupWebView()
            guard let assets = Bundle.main.url(forResource: "web", withExtension: nil) else {
                throw NSError(domain: "PocketKiView", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "The bundled viewers are missing."])
            }
            server.start(assetRoot: assets, snapshotProvider: { [weak self] in
                guard let self = self else { return nil }
                self.snapshotLock.lock()
                defer { self.snapshotLock.unlock() }
                return self.snapshot
            }) { [weak self] result in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    switch result {
                    case .success(let url):
                        self.launchURL = url
                        self.webView.load(URLRequest(url: url))
                    case .failure(let error): self.showError(error.localizedDescription)
                    }
                }
            }
        } catch { showError(error.localizedDescription) }
    }

    private func setupWebView() {
        let content = WKUserContentController()
        content.add(WeakScriptMessageHandler(self), name: "kiview")
        let restored = String(data: (try? JSONEncoder().encode(storage)) ?? Data("{}".utf8), encoding: .utf8) ?? "{}"
        // These scripts run only in app-owned pages; native messages independently validate the origin.
        let script = """
        (()=>{
          const post=body=>window.webkit.messageHandlers.kiview.postMessage(body);
          window.KiViewIOS={openFiles:()=>post({action:'openFiles'}),openFolder:()=>post({action:'openFolder'}),
            ready:()=>post({action:'ready'}),exportText:(name,text,mime)=>post({action:'exportText',name,text,mime})};
          const saved=\(restored),s=window.localStorage;
          if(window===window.top&&s.length===0)for(const[k,v]of Object.entries(saved))s.setItem(k,v);
          const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,clear=Storage.prototype.clear;
          Storage.prototype.setItem=function(k,v){set.call(this,k,v);if(this===window.localStorage)post({action:'storage',key:String(k),value:String(v)});};
          Storage.prototype.removeItem=function(k){remove.call(this,k);if(this===window.localStorage)post({action:'storage',key:String(k),value:null});};
          Storage.prototype.clear=function(){clear.call(this);if(this===window.localStorage)post({action:'clearStorage'});};
        })();
        """
        content.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = content
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    private func trusted(_ url: URL?) -> Bool {
        guard let url = url, let launch = launchURL else { return false }
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == launch.port &&
            trustedPages.contains(url.lastPathComponent)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "kiview", trusted(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        do {
            switch action {
            case "storage":
                guard Set(body.keys) == Set(["action", "key", "value"]), let key = body["key"] as? String,
                      key.utf8.count <= 2048 else { return }
                var next = storage
                if let value = body["value"] as? String {
                    guard value.utf8.count <= 4 * 1024 * 1024 else { return }
                    next[key] = value
                } else if body["value"] is NSNull { next.removeValue(forKey: key) } else { return }
                try saveStorage(next)
            case "clearStorage":
                guard Set(body.keys) == Set(["action"]) else { return }
                try saveStorage([:])
            case "ready":
                guard message.frameInfo.isMainFrame, Set(body.keys) == Set(["action"]) else { return }
                snapshotLock.lock()
                let present = snapshot != nil
                snapshotLock.unlock()
                if present { reloadProject() }
            case "openFiles", "openFolder":
                guard message.frameInfo.isMainFrame, Set(body.keys) == Set(["action"]), !importing else { return }
                folderImport = action == "openFolder"
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: folderImport ? [.folder] : [.item], asCopy: false)
                picker.allowsMultipleSelection = !folderImport
                picker.delegate = self
                present(picker, animated: true)
            case "exportText":
                guard message.frameInfo.isMainFrame || trusted(message.frameInfo.request.url),
                      Set(body.keys) == Set(["action", "name", "text", "mime"]),
                      let name = body["name"] as? String, let text = body["text"] as? String,
                      let mime = body["mime"] as? String else { return }
                try shareText(name: name, text: text, mime: mime)
            default: break
            }
        } catch { showError(error.localizedDescription) }
    }

    private func saveStorage(_ next: [String: String]) throws {
        let data = try JSONEncoder().encode(next)
        guard next.count <= 2000, data.count <= 16 * 1024 * 1024 else {
            throw NSError(domain: "PocketKiView", code: 2, userInfo: [NSLocalizedDescriptionKey: "Review storage is full. Export your review before adding more notes."])
        }
        try data.write(to: storageURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        storage = next
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard !importing else { return }
        importing = true
        let folder = folderImport
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let data = try self.store.importURLs(urls, folder: folder)
                self.snapshotLock.lock()
                self.snapshot = data
                self.snapshotLock.unlock()
                DispatchQueue.main.async { self.importing = false; self.reloadProject() }
            } catch {
                DispatchQueue.main.async { self.importing = false; self.showError(error.localizedDescription) }
            }
        }
    }

    private func reloadProject() {
        webView.evaluateJavaScript("void window.KiCadLocalNative?.reload()") { [weak self] _, error in
            if let error = error { self?.showError(error.localizedDescription) }
        }
    }

    private func shareText(name: String, text: String, mime: String) throws {
        let extensions = ["json": "application/json", "csv": "text/csv", "txt": "text/plain"]
        let suffix = (name as NSString).pathExtension.lowercased()
        guard name.utf8.count <= 120, !name.isEmpty, !name.contains("/"), !name.contains("\\"),
              !name.hasPrefix("."), !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              extensions[suffix] == mime.split(separator: ";").first.map({ String($0) }), text.utf8.count <= 4 * 1024 * 1024 else {
            throw NSError(domain: "PocketKiView", code: 3, userInfo: [NSLocalizedDescriptionKey: "This export format or size is unsupported."])
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent(name)
        try Data(text.utf8).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: directory) }
        present(sheet, animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" || (url.scheme == "http" && url.host == "127.0.0.1" && url.port == launchURL?.port) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, action.targetFrame?.isMainFrame != false,
               url.scheme == "https" { UIApplication.shared.open(url) }
        }
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(trusted(frame.request.url) && type == .camera ? .prompt : .deny)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showError("The viewer ran out of resources. Reopen the app or import a smaller project.")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError("The bundled viewer could not load: " + error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError("The bundled viewer could not load: " + error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        guard webView.url?.lastPathComponent == "local-viewer.html" else { return }
        webView.evaluateJavaScript("document.body.innerText.includes('Pocket KiView for iPhone and iPad') && document.querySelector('#chooseFiles').getBoundingClientRect().width > 0 && !!window.KiCadLocalWorkspace") { [weak self] value, error in
            guard let self = self, value as? Bool == true, error == nil else { return }
            let marker = self.storageURL.deletingLastPathComponent().appendingPathComponent("preview-ready.txt")
            try? Data("Rendered native welcome page".utf8).write(to: marker, options: .atomic)
        }
        #endif
    }

    private func showError(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.presentedViewController == nil else { return }
            let alert = UIAlertController(title: "Pocket KiView", message: text, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            self.present(alert, animated: true)
        }
    }

    deinit { server.stop() }
}
