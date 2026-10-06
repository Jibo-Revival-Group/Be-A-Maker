import SwiftUI
import WebKit

struct BeMakerWebView: UIViewRepresentable {
    let bridge: JiboBridge
    let onInitialLoad: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(bridge: bridge, onInitialLoad: onInitialLoad)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(context.coordinator, forURLScheme: "beamaker")
        let scriptHandlers = [
            "jiboBridge",
            "callbackHandler",
            "startScript",
            "finishScript",
            "scratchLoad",
            "comandHandler",
            "blockMoved",
            "promptEvent"
        ]
        for handler in scriptHandlers {
            configuration.userContentController.add(context.coordinator, name: handler)
        }
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView

        if let url = URL(string: "beamaker://app/index.html") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKURLSchemeHandler, WKScriptMessageHandler, WKNavigationDelegate {
        let bridge: JiboBridge
        let onInitialLoad: () -> Void
        weak var webView: WKWebView?
        private var activeTasks: [ObjectIdentifier: WKURLSchemeTask] = [:]
        private var didReportInitialLoad = false
        private var pendingCommandBlocks: [String: String] = [:]

        init(bridge: JiboBridge, onInitialLoad: @escaping () -> Void) {
            self.bridge = bridge
            self.onInitialLoad = onInitialLoad
            super.init()
            bridge.onTransactionComplete = { [weak self] transactionID in
                Task { @MainActor in
                    await self?.completeTransaction(transactionID)
                }
            }
        }

        func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
            let id = ObjectIdentifier(urlSchemeTask)
            activeTasks[id] = urlSchemeTask

            Task { @MainActor in
                await respond(to: urlSchemeTask)
                activeTasks[id] = nil
            }
        }

        func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
            activeTasks[ObjectIdentifier(urlSchemeTask)] = nil
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            Task { @MainActor in
                await handleScriptMessage(message.body, from: message.name)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !didReportInitialLoad else { return }
            didReportInitialLoad = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [onInitialLoad] in
                onInitialLoad()
            }
        }

        private func handleScriptMessage(_ body: Any, from handlerName: String) async {
            switch handlerName {
            case "jiboBridge":
                guard JSONSerialization.isValidJSONObject(body),
                      let data = try? JSONSerialization.data(withJSONObject: body),
                      let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let name = envelope["name"] as? String else {
                    return
                }

                switch name {
                case "command":
                    if let payload = envelope["payload"] {
                        await handleCommandPayload(payload)
                    }
                case "scratchLoaded":
                    break
                default:
                    break
                }
            case "callbackHandler":
                await handleCommandPayload(body)
            case "scratchLoad", "startScript", "finishScript", "blockMoved":
                break
            case "comandHandler":
                await dispatchSaveMessage(body)
            case "promptEvent":
                await dispatchPromptMessage(body)
            default:
                break
            }
        }

        private func handleCommandPayload(_ payload: Any) async {
            guard JSONSerialization.isValidJSONObject(payload),
                  let commandData = try? JSONSerialization.data(withJSONObject: payload),
                  let command = try? JSONDecoder().decode(JiboCommand.self, from: commandData) else {
                return
            }

            let transactionID = await bridge.handle(command: command)
            let blockID = command.blockID ?? ""
            if let transactionID, !blockID.isEmpty {
                pendingCommandBlocks[transactionID] = blockID
                await evaluate("window.jibo && window.jibo.transactionCallback && window.jibo.transactionCallback(\"\(transactionID.escapedForJavaScript)\", \"\(blockID.escapedForJavaScript)\")")
                scheduleTransactionFallback(transactionID, delay: command.legacyFallbackDelay)
            } else if !blockID.isEmpty {
                await evaluate("window.jibo && window.jibo.eventHandler && window.jibo.eventHandler(\"\(blockID.escapedForJavaScript)\")")
            }
        }

        @MainActor
        private func completeTransaction(_ transactionID: String) async {
            guard let blockID = pendingCommandBlocks.removeValue(forKey: transactionID) else { return }
            await evaluate("window.jibo && window.jibo.eventHandler && window.jibo.eventHandler(\"\(blockID.escapedForJavaScript)\")")
        }

        private func scheduleTransactionFallback(_ transactionID: String, delay: TimeInterval) {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                await completeTransaction(transactionID)
            }
        }

        private func dispatchSaveMessage(_ body: Any) async {
            guard JSONSerialization.isValidJSONObject(body),
                  let data = try? JSONSerialization.data(withJSONObject: body),
                  let json = String(data: data, encoding: .utf8) else {
                return
            }

            await evaluate("window.appInterface && window.appInterface.commandHandler && window.appInterface.commandHandler(\(json))")
        }

        private func dispatchPromptMessage(_ body: Any) async {
            guard JSONSerialization.isValidJSONObject(body),
                  let data = try? JSONSerialization.data(withJSONObject: body),
                  let json = String(data: data, encoding: .utf8) else {
                return
            }

            await evaluate("window.appInterface && window.appInterface.promptEvent && window.appInterface.promptEvent(\(json))")
        }

        @MainActor
        private func respond(to task: WKURLSchemeTask) async {
            guard let url = task.request.url else {
                sendJSON(["message": "Missing URL"], status: 400, to: task)
                return
            }

            let path = normalizedPath(url.path)
            if path.hasPrefix("api/") {
                await respondToAPI(path: path, request: task.request, task: task)
                return
            }

            let filePath: String
            switch path {
            case "", "/": filePath = "index.html"
            case "scratch": filePath = "scratch.html"
            default: filePath = path
            }
            sendResource(filePath, to: task)
        }

        @MainActor
        private func respondToAPI(path: String, request: URLRequest, task: WKURLSchemeTask) async {
            switch path {
            case "api/status":
                sendEncodable(bridge.status, to: task)
            case "api/connect":
                let host = request.jsonBody?["host"] as? String ?? ""
                await bridge.connect(host: host)
                sendEncodable(bridge.status, status: bridge.status.connected ? 200 : 502, to: task)
            case "api/disconnect":
                bridge.disconnect()
                sendJSON(["connected": false], to: task)
            case "api/lan":
                sendJSON(["port": 0, "addresses": [], "origin": "beamaker://app"], to: task)
            case "api/cool-ideas":
                sendResource("apk/raw/cool_ideas.json", mimeType: "application/json", to: task)
            case "api/media":
                sendJSON(["id": "native-face.png", "url": "beamaker://app/native-face.png"], to: task)
            case "api/display":
                if request.jsonBody?["clear"] as? Bool == true {
                    do {
                        try await bridge.clearFace()
                        sendJSON(["ok": true, "eye": true], to: task)
                    } catch {
                        sendJSON(["ok": false, "message": "Connect a Jibo first."], status: 502, to: task)
                    }
                } else {
                    sendJSON(["ok": bridge.status.connected, "message": bridge.status.connected ? "Queued" : "Connect a Jibo first."], status: bridge.status.connected ? 200 : 502, to: task)
                }
            case "api/camera/stop":
                sendJSON(["ok": true], to: task)
            default:
                sendJSON(["message": "Unsupported API endpoint: \(path)"], status: 404, to: task)
            }
        }

        private func sendResource(_ path: String, mimeType explicitMimeType: String? = nil, to task: WKURLSchemeTask) {
            guard let root = Bundle.main.url(forResource: "BeMakerWeb", withExtension: "bundle"),
                  let safeURL = resourceURL(for: path, root: root),
                  let data = try? Data(contentsOf: safeURL) else {
                sendJSON(["message": "Missing resource: \(path)"], status: 404, to: task)
                return
            }

            let response = URLResponse(
                url: task.request.url!,
                mimeType: explicitMimeType ?? mimeType(for: safeURL.pathExtension),
                expectedContentLength: data.count,
                textEncodingName: "utf-8"
            )
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        }

        private func sendEncodable<T: Encodable>(_ value: T, status: Int = 200, to task: WKURLSchemeTask) {
            if let data = try? JSONEncoder().encode(value) {
                sendData(data, status: status, mimeType: "application/json", to: task)
            } else {
                sendJSON(["message": "Encoding failed"], status: 500, to: task)
            }
        }

        private func sendJSON(_ object: [String: Any], status: Int = 200, to task: WKURLSchemeTask) {
            let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
            sendData(data, status: status, mimeType: "application/json", to: task)
        }

        private func sendData(_ data: Data, status: Int, mimeType: String, to task: WKURLSchemeTask) {
            let response = HTTPURLResponse(
                url: task.request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": mimeType]
            )!
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        }

        @MainActor
        private func evaluate(_ script: String) async {
            _ = try? await webView?.evaluateJavaScript(script)
        }

        private func normalizedPath(_ rawPath: String) -> String {
            rawPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }

        private func resourceURL(for path: String, root: URL) -> URL? {
            let candidate = root.appending(path: path).standardizedFileURL
            let rootPath = root.standardizedFileURL.path
            guard candidate.path == rootPath || candidate.path.hasPrefix(rootPath + "/") else {
                return nil
            }
            return candidate
        }

        private func mimeType(for ext: String) -> String {
            switch ext.lowercased() {
            case "html": return "text/html"
            case "css": return "text/css"
            case "js": return "application/javascript"
            case "json": return "application/json"
            case "png": return "image/png"
            case "jpg", "jpeg": return "image/jpeg"
            case "svg": return "image/svg+xml"
            case "gif": return "image/gif"
            case "map": return "application/json"
            default: return "application/octet-stream"
            }
        }
    }
}

private extension URLRequest {
    var jsonBody: [String: Any]? {
        if let httpBody,
           let object = try? JSONSerialization.jsonObject(with: httpBody) as? [String: Any] {
            return object
        }

        guard let stream = httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }

        var data = Data()
        let bufferSize = 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }

        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }

        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}

private extension JiboCommand {
    var legacyFallbackDelay: TimeInterval {
        switch normalizedBlockType {
        case "say":
            let esml = args.first?.description.lowercased() ?? ""
            if esml.contains("<anim") && esml.contains("nonblocking='false'") {
                return 4
            }
            if esml.contains("<anim") {
                return 1.2
            }
            return 0.4
        case "listen":
            return 15
        case "lookat", "lookat3d":
            return 0.8
        case "takephoto":
            return 1.5
        default:
            return 0.6
        }
    }
}

private extension String {
    var escapedForJavaScript: String {
        replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
    }
}
